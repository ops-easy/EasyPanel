package core

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

//go:embed default_guides/*.md
var defaultDocGuidesFS embed.FS

type docGuideMeta struct {
	ID           uint64
	GuideKey     string
	RoutePattern string
	MatchType    string
	DocID        uint64
	Enabled      bool
	SortOrder    int
}

type docGuideResolveRow struct {
	docGuideMeta
	Title       string
	Body        string
	Author      string
	ContentKind string
	Published   bool
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func normalizeDocGuidePath(s string) string {
	p := strings.TrimSpace(s)
	if i := strings.IndexAny(p, "?#"); i >= 0 {
		p = p[:i]
	}
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	p = path.Clean(p)
	if p == "." {
		return "/"
	}
	return p
}

func docsNormalizeGuideMatchType(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "exact":
		return "exact"
	case "global":
		return "global"
	default:
		return "prefix"
	}
}

func docsNormalizeGuideKey(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func docsGuideKeyValid(s string) bool {
	if s == "" || len(s) > 128 {
		return false
	}
	for _, r := range s {
		if r >= 'a' && r <= 'z' {
			continue
		}
		if r >= '0' && r <= '9' {
			continue
		}
		switch r {
		case '.', '-', '_':
			continue
		default:
			return false
		}
	}
	return true
}

func docGuideRouteMatches(g docGuideMeta, reqPath string) bool {
	if !g.Enabled {
		return false
	}
	mt := docsNormalizeGuideMatchType(g.MatchType)
	rp := normalizeDocGuidePath(g.RoutePattern)
	p := normalizeDocGuidePath(reqPath)
	switch mt {
	case "global":
		return true
	case "exact":
		return p == rp
	default:
		if rp == "/" {
			return p == "/"
		}
		return p == rp || strings.HasPrefix(p, rp+"/")
	}
}

func resolveBestDocGuide(guides []docGuideMeta, reqPath string) (docGuideMeta, bool, bool) {
	p := normalizeDocGuidePath(reqPath)
	bestScore := -1
	bestFallback := false
	var best docGuideMeta
	for _, g := range guides {
		if !docGuideRouteMatches(g, p) {
			continue
		}
		mt := docsNormalizeGuideMatchType(g.MatchType)
		rp := normalizeDocGuidePath(g.RoutePattern)
		score := 0
		fallback := false
		switch mt {
		case "exact":
			score = 100000 + len(rp)
		case "global":
			score = 1
			fallback = p != rp
		default:
			score = 1000 + len(rp)
		}
		if score > bestScore || (score == bestScore && g.SortOrder < best.SortOrder) {
			bestScore = score
			bestFallback = fallback
			best = g
		}
	}
	return best, bestFallback, bestScore >= 0
}

func docsGuideMetaJSON(g docGuideMeta) gin.H {
	return gin.H{
		"id":           g.ID,
		"guideKey":     g.GuideKey,
		"routePattern": normalizeDocGuidePath(g.RoutePattern),
		"matchType":    docsNormalizeGuideMatchType(g.MatchType),
		"docId":        g.DocID,
		"enabled":      g.Enabled,
		"sortOrder":    g.SortOrder,
	}
}

func docsGuideDocJSON(r docGuideResolveRow) gin.H {
	return gin.H{
		"id":           r.DocID,
		"title":        r.Title,
		"bodyMarkdown": r.Body,
		"author":       r.Author,
		"published":    r.Published,
		"contentKind":  docsNormalizeContentKind(r.ContentKind),
		"createdAt":    r.CreatedAt.Format(time.RFC3339),
		"updatedAt":    r.UpdatedAt.Format(time.RFC3339),
		"previewUrl":   fmt.Sprintf("/r/%d.html", r.DocID),
	}
}

func docsLoadGuideResolveRows(ctx context.Context, db *sql.DB) ([]docGuideResolveRow, error) {
	rows, err := db.QueryContext(ctx, `SELECT g.id, g.guide_key, g.route_pattern, g.match_type, g.doc_id, g.enabled, g.sort_order,
		d.title, d.body_markdown, d.content_kind, d.author, d.published, d.created_at, d.updated_at
		FROM easypanel_doc_guides g
		JOIN easypanel_docs d ON d.id = g.doc_id
		ORDER BY g.sort_order ASC, g.id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []docGuideResolveRow
	for rows.Next() {
		var r docGuideResolveRow
		var enabled, published int
		if err := rows.Scan(&r.ID, &r.GuideKey, &r.RoutePattern, &r.MatchType, &r.DocID, &enabled, &r.SortOrder,
			&r.Title, &r.Body, &r.ContentKind, &r.Author, &published, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.Enabled = enabled != 0
		r.Published = published != 0
		out = append(out, r)
	}
	return out, rows.Err()
}

func docsGuidesResolve(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	reqPath := normalizeDocGuidePath(c.Query("path"))
	dbCtx, cancel := docsMySQLOpContext()
	defer cancel()
	rows, err := docsLoadGuideResolveRows(dbCtx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	metas := make([]docGuideMeta, 0, len(rows))
	byKey := make(map[string]docGuideResolveRow, len(rows))
	for _, r := range rows {
		metas = append(metas, r.docGuideMeta)
		byKey[r.GuideKey] = r
	}
	match, fallback, ok := resolveBestDocGuide(metas, reqPath)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"matched": false, "path": reqPath, "error": "当前页面暂无指南"})
		return
	}
	row := byKey[match.GuideKey]
	c.JSON(http.StatusOK, gin.H{
		"matched":  true,
		"fallback": fallback,
		"path":     reqPath,
		"guide":    docsGuideMetaJSON(match),
		"doc":      docsGuideDocJSON(row),
	})
}

func docsGuidesList(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	dbCtx, cancel := docsMySQLOpContext()
	defer cancel()
	rows, err := docsLoadGuideResolveRows(dbCtx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		out = append(out, gin.H{
			"guide": docsGuideMetaJSON(r.docGuideMeta),
			"doc": gin.H{
				"id":          r.DocID,
				"title":       r.Title,
				"contentKind": docsNormalizeContentKind(r.ContentKind),
				"updatedAt":   r.UpdatedAt.Format(time.RFC3339),
				"previewUrl":  fmt.Sprintf("/r/%d.html", r.DocID),
			},
		})
	}
	c.JSON(http.StatusOK, gin.H{"guides": out})
}

type docsGuideSaveBody struct {
	GuideKey     string `json:"guideKey"`
	RoutePattern string `json:"routePattern"`
	MatchType    string `json:"matchType"`
	DocID        uint64 `json:"docId"`
	Title        string `json:"title"`
	BodyMarkdown string `json:"bodyMarkdown"`
	Enabled      *bool  `json:"enabled"`
	SortOrder    *int   `json:"sortOrder"`
}

func docsGuidesCreate(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body docsGuideSaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	key := docsNormalizeGuideKey(body.GuideKey)
	if !docsGuideKeyValid(key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "guideKey 仅支持小写字母、数字、点、横线和下划线"})
		return
	}
	routePattern := normalizeDocGuidePath(body.RoutePattern)
	matchType := docsNormalizeGuideMatchType(body.MatchType)
	enabled := true
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	sortOrder := 0
	if body.SortOrder != nil {
		sortOrder = *body.SortOrder
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		title = key
	}
	bodyMarkdown := docsNormalizeWireNewlines(body.BodyMarkdown)
	if strings.TrimSpace(bodyMarkdown) == "" {
		bodyMarkdown = "# " + title + "\n\n补充这个页面的操作说明。"
	}
	tx, err := db.Begin()
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	defer func() { _ = tx.Rollback() }()
	docID := body.DocID
	who := docsActor(c, app)
	if docID == 0 {
		res, err := tx.Exec(`INSERT INTO easypanel_docs (title, body_markdown, content_kind, author, published) VALUES (?,?,?,?,0)`,
			title, bodyMarkdown, "markdown", who)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		id64, _ := res.LastInsertId()
		docID = uint64(id64)
		if err := docsInsertVersion(tx, docID, 1, title, bodyMarkdown, who, "markdown"); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	if _, err := tx.Exec(`INSERT INTO easypanel_doc_guides (guide_key, route_pattern, match_type, doc_id, enabled, sort_order) VALUES (?,?,?,?,?,?)`,
		key, routePattern, matchType, docID, boolInt(enabled), sortOrder); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := tx.Commit(); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, docID)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"guideKey": key, "docId": docID})
}

func docsGuidesUpdate(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	key := docsNormalizeGuideKey(c.Param("guideKey"))
	if !docsGuideKeyValid(key) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 guideKey"})
		return
	}
	var body docsGuideSaveBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var curDocID uint64
	var curRoutePattern, curMatchType string
	var curEnabled, curSortOrder int
	if err := db.QueryRow(`SELECT doc_id, route_pattern, match_type, enabled, sort_order FROM easypanel_doc_guides WHERE guide_key=?`, key).Scan(
		&curDocID, &curRoutePattern, &curMatchType, &curEnabled, &curSortOrder,
	); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "系统指南不存在"})
		return
	} else if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	routePattern := normalizeDocGuidePath(curRoutePattern)
	if strings.TrimSpace(body.RoutePattern) != "" {
		routePattern = normalizeDocGuidePath(body.RoutePattern)
	}
	matchType := docsNormalizeGuideMatchType(curMatchType)
	if strings.TrimSpace(body.MatchType) != "" {
		matchType = docsNormalizeGuideMatchType(body.MatchType)
	}
	enabled := curEnabled != 0
	if body.Enabled != nil {
		enabled = *body.Enabled
	}
	sortOrder := curSortOrder
	if body.SortOrder != nil {
		sortOrder = *body.SortOrder
	}
	docID := curDocID
	if body.DocID > 0 {
		docID = body.DocID
	}
	res, err := db.Exec(`UPDATE easypanel_doc_guides SET route_pattern=?, match_type=?, doc_id=?, enabled=?, sort_order=? WHERE guide_key=?`,
		routePattern, matchType, docID, boolInt(enabled), sortOrder, key)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "系统指南不存在"})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, curDocID, docID)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func docsGuidesDelete(c *gin.Context, app *ServerApp) {
	db := docsRequireMySQL(c, app)
	if db == nil {
		return
	}
	key := docsNormalizeGuideKey(c.Param("guideKey"))
	var docID uint64
	if err := db.QueryRow(`SELECT doc_id FROM easypanel_doc_guides WHERE guide_key=?`, key).Scan(&docID); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "系统指南不存在"})
		return
	} else if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if _, err := db.Exec(`DELETE FROM easypanel_doc_guides WHERE guide_key=?`, key); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	docsBumpCtx, docsBumpCancel := context.WithTimeout(context.Background(), 3*time.Second)
	docsBumpDocsAPICache(docsBumpCtx, app, docID)
	docsBumpCancel()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

type defaultDocGuideSpec struct {
	GuideKey     string
	RoutePattern string
	MatchType    string
	Title        string
	File         string
	SortOrder    int
}

var defaultDocGuideSpecs = []defaultDocGuideSpec{
	{"global", "/", "global", "平台全局指南", "global.md", 0},
	{"cluster.settings", "/cluster/settings", "prefix", "集群设置指南", "cluster-settings.md", 10},
	{"baota.sync", "/cluster/baota", "prefix", "宝塔同步指南", "baota-sync.md", 20},
	{"appcenter", "/cluster/apps", "prefix", "应用中心指南", "appcenter.md", 30},
	{"appcenter.cloud-vm", "/cluster/apps/cloud-vm", "prefix", "容器主机指南", "cloud-vm.md", 40},
	{"ai-inspect", "/cluster/ai-inspect", "prefix", "AI 巡检指南", "ai-inspect.md", 50},
	{"docs", "/docs", "prefix", "文档中心指南", "docs.md", 60},
	{"account", "/account", "prefix", "账户与权限指南", "account.md", 70},
}

func ensureDefaultDocGuides(db *sql.DB) error {
	for _, spec := range defaultDocGuideSpecs {
		key := docsNormalizeGuideKey(spec.GuideKey)
		routePattern := normalizeDocGuidePath(spec.RoutePattern)
		matchType := docsNormalizeGuideMatchType(spec.MatchType)
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM easypanel_doc_guides WHERE guide_key=? OR (route_pattern=? AND match_type=?)`, key, routePattern, matchType).Scan(&n); err != nil {
			return err
		}
		if n > 0 {
			continue
		}
		raw, err := defaultDocGuidesFS.ReadFile("default_guides/" + spec.File)
		if err != nil {
			return err
		}
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		title := strings.TrimSpace(spec.Title)
		body := docsNormalizeWireNewlines(string(raw))
		res, err := tx.Exec(`INSERT INTO easypanel_docs (title, body_markdown, content_kind, author, published) VALUES (?,?,?,?,0)`,
			title, body, "markdown", "system")
		if err != nil {
			_ = tx.Rollback()
			return err
		}
		id64, _ := res.LastInsertId()
		docID := uint64(id64)
		if err := docsInsertVersion(tx, docID, 1, title, body, "system", "markdown"); err != nil {
			_ = tx.Rollback()
			return err
		}
		if _, err := tx.Exec(`INSERT INTO easypanel_doc_guides (guide_key, route_pattern, match_type, doc_id, enabled, sort_order) VALUES (?,?,?,?,1,?)`,
			key, routePattern, matchType, docID, spec.SortOrder); err != nil {
			_ = tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}

func sortDocGuideMetasForTest(guides []docGuideMeta) {
	sort.Slice(guides, func(i, j int) bool {
		if guides[i].SortOrder != guides[j].SortOrder {
			return guides[i].SortOrder < guides[j].SortOrder
		}
		return guides[i].ID < guides[j].ID
	})
}
