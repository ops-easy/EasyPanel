package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	harborprovider "kube-bt-sync/api/harbor/provider"

	"github.com/gin-gonic/gin"
)

func harborClientFromCfg(cfg Config) *harborprovider.Client {
	return harborprovider.NewClient(harborprovider.ClientConfig{
		BaseURL:  cfg.HarborBaseURL,
		Username: cfg.HarborUsername,
		Password: cfg.HarborPassword,
		SkipTLS:  cfg.HarborSkipTLS,
	})
}

func maskHarborURL(raw string) string {
	return harborprovider.MaskURL(raw)
}

// harborRegistryPullHost 用于 docker/K8s 镜像引用（host 或 host:port），不含路径与协议。
func harborRegistryPullHost(baseURL string) string {
	return harborprovider.RegistryPullHost(baseURL)
}

// harborNormalizeRepositoryForProject Harbor 列表接口返回的 name 常为「项目名/仓库名」（与镜像全名一致），
// 而 API 路径已是 /projects/{project}/repositories/{repository_name}，此处应去掉与 project 重复的前缀，否则会 404。
func harborNormalizeRepositoryForProject(project, repo string) string {
	return harborprovider.NormalizeRepositoryForProject(project, repo)
}

// harborRepositoryPathSegmentCandidates Harbor .../repositories/{repository_name}/... 中仓库名单段须 PathEscape；
// 含 "/" 的层级仓库标准写法是将 slash 编成 %2F。若前有网关把 %2F 解码成 /，会拆成多段路由而 404，此时再试对整段二次 Escape（%→%25），即 kubebuilder%252Fkube-rbac-proxy。
func harborRepositoryPathSegmentCandidates(repoRelative string) []string {
	return harborprovider.RepositoryPathSegmentCandidates(repoRelative)
}

func harborDoGET404RepoAlt(ctx context.Context, cfg Config, primary, alt string) ([]byte, int, error) {
	return harborClientFromCfg(cfg).DoGET404RepoAlt(ctx, primary, alt)
}

func harborDoMethod404RepoAlt(ctx context.Context, cfg Config, method, primary, alt string, body io.Reader) ([]byte, int, error) {
	return harborClientFromCfg(cfg).DoMethod404RepoAlt(ctx, method, primary, alt, body)
}

// harborArtifactListRepoPathEsc 对含 / 的仓库探测单重与双重路径编码，避免索引分页时每页先试 404 再重试。
func harborArtifactListRepoPathEsc(ctx context.Context, cfg Config, projEsc, repoRel string) string {
	return harborClientFromCfg(cfg).ArtifactListRepoPathEsc(ctx, projEsc, repoRel)
}

// harborLooksLikeDockerTag 用于从「仓库名:tag」中剥离 tag，避免 repositories 的 q 含冒号触发 Harbor 400。
func harborLooksLikeDockerTag(tag string) bool {
	return harborprovider.LooksLikeDockerTag(tag)
}

func harborIsColonRune(r rune) bool {
	return harborprovider.IsColonRune(r)
}

// harborTrimTrailingColons 去掉末尾冒号（含全角），避免 busybox: / busybox： 触发 Harbor repositories 的 q 解析 400。
func harborTrimTrailingColons(s string) string {
	return harborprovider.TrimTrailingColons(s)
}

// harborLastColonIndex 返回最后一个 ASCII/全角冒号的字节下标，无则 -1。
func harborLastColonIndex(s string) int {
	return harborprovider.LastColonIndex(s)
}

// harborSanitizeRepositoryListQ Harbor GET .../repositories 的 q 为查询/glob 语法，镜像引用中的冒号（如 busybox:1.36、busybox:）会导致上游 400。
func harborSanitizeRepositoryListQ(raw string) string {
	return harborprovider.SanitizeRepositoryListQ(raw)
}

func harborConfiguredFromCfg(cfg Config) bool {
	return harborprovider.Configured(cfg.HarborBaseURL, cfg.HarborUsername, cfg.HarborPassword)
}

func harborAPIRoot(cfg Config) string {
	return harborprovider.APIRoot(cfg.HarborBaseURL)
}

// harborResolvePublicUIURL 浏览器可打开的 Harbor 控制台根地址（不含凭据）。
// 优先使用 Harbor systeminfo.external_url，否则使用运行时 harborBaseUrl。
func harborResolvePublicUIURL(cfg Config, systeminfo map[string]any) string {
	return harborprovider.ResolvePublicUIURL(cfg.HarborBaseURL, systeminfo)
}

// harborFetchSystemInfoMap 拉取 GET /systeminfo 解析为 map（失败返回 nil）。
func harborFetchSystemInfoMap(ctx context.Context, cfg Config) map[string]any {
	return harborClientFromCfg(cfg).FetchSystemInfoMap(ctx)
}

func harborDo(ctx context.Context, cfg Config, method, pathAndQuery string, body io.Reader) ([]byte, int, error) {
	b, code, err := harborClientFromCfg(cfg).Do(ctx, method, pathAndQuery, body)
	if err == harborprovider.ErrNotConfigured {
		return nil, 0, errHarborNotConfigured
	}
	return b, code, err
}

// harborAPIErrorItem Harbor v2 常见错误体：{"errors":[{"code":"UNAUTHORIZED","message":"unauthorized"}]}
type harborAPIErrorItem = harborprovider.APIErrorItem

func harborParseUpstreamErrors(b []byte) []harborAPIErrorItem {
	return harborprovider.ParseUpstreamErrors(b)
}

// harborFormatHarborAuthFailure 将上游 401/403 正文整理为可读说明（解析 Harbor errors JSON，避免整段 JSON 塞进 error）。
func harborFormatHarborAuthFailure(code int, b []byte) (human string, items []harborAPIErrorItem) {
	return harborprovider.FormatAuthFailure(code, b)
}

// harborUnauthorizedUserHint 说明本平台账号与 Harbor 凭据、Harbor「系统管理员」与项目成员的区别（用于 401/403 → 502 的 JSON hint 字段）。
func harborUnauthorizedUserHint(requestPath string) string {
	var b strings.Builder
	b.WriteString("【常见误解】您在 kube-bt-sync 控制台是否为「管理员」、登录名是否为 abcdocker，只决定本平台权限；访问 Harbor API 时始终使用「集群设置 → 运行时」中的 harborUsername / harborPassword（或 Robot 名+密钥）。两者不必相同。\n\n")
	if strings.Contains(requestPath, "/harbor/statistics") {
		b.WriteString("【statistics】Harbor 的 GET /statistics 在 OpenAPI 中标注可能返回 401：通常仅 Harbor「系统管理员」用户可调用。\n\n")
		b.WriteString("【Robot】Harbor 按设计将 statistics 视为非资源类接口，系统级 Robot 即使勾选全部读权限，仍常返回 401 或数据不完整（与是否「授权」无关，属 Harbor 对 Robot 的限制）。\n\n")
		b.WriteString("【平台行为】当 /statistics 返回 401/403 时，kube-bt-sync 会改用 /projects 与各项目 /summary 做汇总（与列表相同 Basic 凭据）。\n\n")
		b.WriteString("【建议】需要与 Harbor 完全一致的官方 statistics 时：在运行时使用具备系统管理员的用户账号（非 Robot）；若坚持用 Robot，请接受本页/本接口的项目汇总结果。改凭据或权限后可在 Harbor 页点「刷新列表」并带 refresh=1 跳过 Redis 读缓存。\n")
	} else {
		b.WriteString("【权限】部分 Harbor 接口比「列项目/仓库」要求更高角色；Robot 账号请在 Harbor 中检查权限范围是否包含当前操作。\n")
	}
	return b.String()
}

// harborForwardHarborResponse 将 Harbor 上游 HTTP 结果写回客户端。
// 401/403 映射为 502 JSON，避免浏览器把「Harbor 鉴权失败」当成本站未登录而整页跳转 /login（与 fetch 全局 401 处理冲突）。
func harborForwardHarborResponse(c *gin.Context, code int, contentType string, b []byte) {
	if code == http.StatusUnauthorized || code == http.StatusForbidden {
		detail, items := harborFormatHarborAuthFailure(code, b)
		msg := "Harbor 鉴权失败：" + detail + "。"
		if code == http.StatusUnauthorized {
			msg += " 项目/仓库列表若正常，说明 BasicAuth 账号密码有效，但当前接口在 Harbor 侧要求更高角色。"
		} else {
			msg += " 请检查 Harbor 中该账号对目标资源的访问权限。"
		}
		hint := harborUnauthorizedUserHint(c.Request.URL.Path)
		out := gin.H{
			"error":            msg,
			"hint":             hint,
			"harborHttpStatus": code,
		}
		if len(items) > 0 {
			out["harborErrors"] = items
		}
		c.JSON(http.StatusBadGateway, out)
		return
	}
	ct := contentType
	if ct == "" {
		ct = "application/json; charset=utf-8"
	}
	if len(b) > 0 {
		c.Data(code, ct, b)
		return
	}
	c.Status(code)
}

var errHarborNotConfigured = &harborConfigError{}

type harborConfigError struct{}

func (e *harborConfigError) Error() string {
	return "Harbor 未配置（请在运行时配置 harborBaseUrl、harborUsername、harborPassword）"
}

func HandleHarborStatus(app *ServerApp) gin.HandlerFunc {
	return handleHarborStatus(app)
}

func HandleHarborStatistics(app *ServerApp) gin.HandlerFunc {
	return handleHarborStatistics(app)
}

func HandleHarborProjects(app *ServerApp) gin.HandlerFunc {
	return handleHarborProjects(app)
}

func HandleHarborRepositories(app *ServerApp) gin.HandlerFunc {
	return handleHarborRepositories(app)
}

func HandleHarborArtifactAddition(app *ServerApp) gin.HandlerFunc {
	return handleHarborArtifactAddition(app)
}

func HandleHarborArtifacts(app *ServerApp) gin.HandlerFunc {
	return handleHarborArtifacts(app)
}

func HandleHarborDeleteArtifact(app *ServerApp) gin.HandlerFunc {
	return handleHarborDeleteArtifact(app)
}

func handleHarborStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusOK, gin.H{"configured": false})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
		defer cancel()
		b, code, err := harborDo(ctx, cfg, http.MethodGet, "/ping", nil)
		out := gin.H{
			"configured": true,
			"reachable":  err == nil && code == http.StatusOK,
			"httpStatus": code,
		}
		if err != nil {
			out["detail"] = err.Error()
		} else if code != http.StatusOK {
			out["detail"] = strings.TrimSpace(string(b))
		}
		var sysMap map[string]any
		if err == nil && code == http.StatusOK {
			if sys, sc, e2 := harborDo(ctx, cfg, http.MethodGet, "/systeminfo", nil); e2 == nil && sc == http.StatusOK {
				var m map[string]any
				if json.Unmarshal(sys, &m) == nil {
					out["systeminfo"] = m
					sysMap = m
				}
			}
		}
		if ui := strings.TrimSpace(harborResolvePublicUIURL(cfg, sysMap)); ui != "" {
			out["harborUiUrl"] = ui
		}
		c.JSON(http.StatusOK, out)
	}
}

// harborStatisticsJSONLooksLikeStatistic 避免把登录页/HTML 或非统计 JSON 写入 Redis。
func harborStatisticsJSONLooksLikeStatistic(b []byte) bool {
	return harborprovider.StatisticsJSONLooksLikeStatistic(b)
}

// harborStatisticsPrunedJSONBody 仅保留 Harbor 官方统计中的项目数与仓库数，供控制台展示。
func harborStatisticsPrunedJSONBody(b []byte) []byte {
	return harborprovider.StatisticsPrunedJSONBody(b)
}

func harborStatisticsSkipRedisCache(c *gin.Context) bool {
	if c == nil {
		return false
	}
	q := strings.TrimSpace(c.Query("refresh"))
	if q == "1" || strings.EqualFold(q, "true") || strings.EqualFold(q, "yes") {
		return true
	}
	q = strings.TrimSpace(c.Query("nocache"))
	return q == "1" || strings.EqualFold(q, "true")
}

func harborGETStatisticsCached(ctx context.Context, app *ServerApp, c *gin.Context) ([]byte, int, error) {
	cfg := app.Cfg()
	ttl := harborListCacheTTL()
	rdb := app.Redis()
	skipRedis := harborStatisticsSkipRedisCache(c)
	if !skipRedis && ttl > 0 && rdb != nil {
		gen := harborCacheGenRead(ctx, rdb, cfg)
		key := harborListCacheRedisKey(cfg, gen, "stat", "v1")
		if key != "" {
			if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" && harborStatisticsJSONLooksLikeStatistic([]byte(raw)) {
				harborIncCacheHit()
				if c != nil {
					c.Header("X-KubeBT-Harbor-Cache", "hit")
				}
				return []byte(raw), http.StatusOK, nil
			}
		}
		harborIncCacheMiss()
	} else if skipRedis && c != nil {
		c.Header("X-KubeBT-Harbor-Cache", "bypass")
		harborIncCacheMiss()
	}
	b, code, err := harborDo(ctx, cfg, http.MethodGet, "/statistics", nil)
	if err != nil {
		if c != nil {
			c.Header("X-KubeBT-Harbor-Cache", "miss")
		}
		return nil, code, err
	}
	// refresh=1 仅跳过读缓存；成功响应仍写入 Redis，便于后续请求命中最新 statistics。
	if code == http.StatusOK && ttl > 0 && rdb != nil && len(b) > 0 && len(b) <= harborListCacheMaxBodyBytes() && harborStatisticsJSONLooksLikeStatistic(b) {
		gen := harborCacheGenRead(ctx, rdb, cfg)
		key := harborListCacheRedisKey(cfg, gen, "stat", "v1")
		if key != "" {
			_ = rdb.Set(ctx, key, b, ttl)
		}
	}
	if c != nil && !skipRedis {
		c.Header("X-KubeBT-Harbor-Cache", "miss")
	}
	return b, code, err
}

func harborJSONToInt64(v interface{}) int64 {
	return harborprovider.JSONToInt64(v)
}

// harborStatisticsAggregateFromProjects 在 GET /statistics 返回 401/403 时：分页 /projects 汇总项目数与各项目 repo_count 之和。
func harborStatisticsAggregateFromProjects(ctx context.Context, cfg Config) (map[string]interface{}, error) {
	var totalProjects, totalRepos int64
	page := 1
	pageSize := 100
	const maxPages = 200
	for page <= maxPages {
		path := fmt.Sprintf("/projects?page=%d&page_size=%d", page, pageSize)
		b, code, err := harborDo(ctx, cfg, http.MethodGet, path, nil)
		if err != nil {
			return nil, err
		}
		if code != http.StatusOK {
			return nil, fmt.Errorf("Harbor /projects HTTP %d", code)
		}
		var items []map[string]interface{}
		if err := json.Unmarshal(b, &items); err != nil {
			return nil, fmt.Errorf("解析 /projects: %w", err)
		}
		if len(items) == 0 {
			break
		}
		for _, it := range items {
			totalProjects++
			rc := harborJSONToInt64(it["repo_count"])
			totalRepos += rc
		}
		if len(items) < pageSize {
			break
		}
		page++
	}

	return map[string]interface{}{
		"total_project_count": totalProjects,
		"total_repo_count":    totalRepos,
	}, nil
}

// harborProxyCachedListGET 经 Harbor v2 API 的列表类 GET，Redis 短缓存；X-KubeBT-Harbor-Cache: hit|miss。
// harborAltPathOn404 非空且首包 404 时再 GET 一次（层级仓库名经网关错误解码 %2F 时用双重编码路径）。
func harborProxyCachedListGET(c *gin.Context, app *ServerApp, apiRoute, cacheKind string, cacheParts []string, harborPathAndQuery string, harborAltPathOn404 ...string) {
	t0 := time.Now()
	cfg := app.Cfg()
	if !harborConfiguredFromCfg(cfg) {
		c.JSON(http.StatusBadRequest, gin.H{"error": errHarborNotConfigured.Error()})
		return
	}
	sub := harborSubKeyHash(cacheParts...)
	ttl := harborListCacheTTL()
	ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
	defer cancel()
	if ttl > 0 {
		if rdb := app.Redis(); rdb != nil {
			gen := harborCacheGenRead(ctx, rdb, cfg)
			key := harborListCacheRedisKey(cfg, gen, cacheKind, sub)
			if key != "" {
				if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" {
					harborIncCacheHit()
					recordHarborProxyAccess(app, c, apiRoute, harborPathAndQuery, http.StatusOK, time.Since(t0), true, "")
					c.Header("X-KubeBT-Harbor-Cache", "hit")
					c.Data(http.StatusOK, "application/json; charset=utf-8", []byte(raw))
					return
				}
			}
			harborIncCacheMiss()
		}
	}
	b, code, err := harborDo(ctx, cfg, http.MethodGet, harborPathAndQuery, nil)
	alt404 := ""
	if len(harborAltPathOn404) > 0 {
		alt404 = strings.TrimSpace(harborAltPathOn404[0])
	}
	if err == nil && code == http.StatusNotFound && alt404 != "" && alt404 != harborPathAndQuery {
		b, code, err = harborDo(ctx, cfg, http.MethodGet, alt404, nil)
	}
	d := time.Since(t0)
	if err != nil {
		recordHarborProxyAccess(app, c, apiRoute, harborPathAndQuery, 0, d, false, err.Error())
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	note := ""
	if code != http.StatusOK {
		note = strings.TrimSpace(string(b))
	}
	if code == http.StatusOK && ttl > 0 && len(b) > 0 && len(b) <= harborListCacheMaxBodyBytes() {
		if rdb := app.Redis(); rdb != nil {
			gen := harborCacheGenRead(ctx, rdb, cfg)
			key := harborListCacheRedisKey(cfg, gen, cacheKind, sub)
			if key != "" {
				_ = rdb.Set(ctx, key, b, ttl)
			}
		}
	}
	recordHarborProxyAccess(app, c, apiRoute, harborPathAndQuery, code, d, false, note)
	c.Header("X-KubeBT-Harbor-Cache", "miss")
	harborForwardHarborResponse(c, code, "application/json; charset=utf-8", b)
}

func handleHarborStatistics(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusBadRequest, gin.H{"error": errHarborNotConfigured.Error()})
			return
		}
		t0 := time.Now()
		ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
		defer cancel()
		b, code, err := harborGETStatisticsCached(ctx, app, c)
		d := time.Since(t0)
		if err != nil {
			recordHarborProxyAccess(app, c, "/api/harbor/statistics", "/statistics", 0, d, false, err.Error())
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if code == http.StatusUnauthorized || code == http.StatusForbidden {
			if fb, ferr := harborStatisticsAggregateFromProjects(ctx, cfg); ferr == nil {
				fromCache := strings.EqualFold(strings.TrimSpace(c.GetHeader("X-KubeBT-Harbor-Cache")), "hit")
				c.Header("X-KubeBT-Harbor-Statistics", "fallback")
				c.Header("X-KubeBT-Harbor-Statistics-Upstream-Status", strconv.Itoa(code))
				recordHarborProxyAccess(app, c, "/api/harbor/statistics", "/statistics+fallback_projects", http.StatusOK, d, fromCache, "upstream "+strconv.Itoa(code))
				c.JSON(http.StatusOK, fb)
				return
			}
		}
		note := ""
		if code != http.StatusOK {
			note = strings.TrimSpace(string(b))
		}
		fromCache := strings.EqualFold(strings.TrimSpace(c.GetHeader("X-KubeBT-Harbor-Cache")), "hit")
		recordHarborProxyAccess(app, c, "/api/harbor/statistics", "/statistics", code, d, fromCache, note)
		if code == http.StatusOK && len(b) > 0 {
			b = harborStatisticsPrunedJSONBody(b)
		}
		harborForwardHarborResponse(c, code, "application/json; charset=utf-8", b)
	}
}

func handleHarborProjects(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := url.Values{}
		if p := strings.TrimSpace(c.Query("page")); p != "" {
			q.Set("page", p)
		} else {
			q.Set("page", "1")
		}
		if ps := strings.TrimSpace(c.Query("page_size")); ps != "" {
			q.Set("page_size", ps)
		} else {
			q.Set("page_size", "50")
		}
		if name := strings.TrimSpace(c.Query("name")); name != "" {
			q.Set("name", name)
		}
		if pub := strings.TrimSpace(c.Query("public")); pub != "" {
			q.Set("public", pub)
		}
		enc := q.Encode()
		harborPath := "/projects?" + enc
		harborProxyCachedListGET(c, app, "/api/harbor/projects", "proj", []string{enc}, harborPath)
	}
}

func handleHarborRepositories(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		project := strings.TrimSpace(c.Param("project"))
		if project == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 project"})
			return
		}
		q := url.Values{}
		if p := strings.TrimSpace(c.Query("page")); p != "" {
			q.Set("page", p)
		} else {
			q.Set("page", "1")
		}
		if ps := strings.TrimSpace(c.Query("page_size")); ps != "" {
			q.Set("page_size", ps)
		} else {
			q.Set("page_size", "50")
		}
		if qs := strings.TrimSpace(c.Query("q")); qs != "" {
			if clean := harborSanitizeRepositoryListQ(qs); clean != "" {
				q.Set("q", clean)
			}
		}
		enc := q.Encode()
		harborPath := "/projects/" + url.PathEscape(project) + "/repositories?" + enc
		harborProxyCachedListGET(c, app, "/api/harbor/projects/:project/repositories", "repo", []string{project, enc}, harborPath)
	}
}

func harborArtifactAdditionAllowed(addition string) bool {
	return harborprovider.ArtifactAdditionAllowed(addition)
}

// handleHarborArtifactAddition GET Harbor 制品附加信息，如 build_history（镜像 Dockerfile 层 / 打包历史）。
// Query: repository（相对项目仓库名）, reference（tag 或 digest）, addition（默认 build_history）。
func handleHarborArtifactAddition(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusBadRequest, gin.H{"error": errHarborNotConfigured.Error()})
			return
		}
		project := strings.TrimSpace(c.Param("project"))
		repoPath := strings.Trim(strings.TrimSpace(c.Query("repository")), "/")
		ref := strings.TrimSpace(c.Query("reference"))
		addition := strings.TrimSpace(c.Query("addition"))
		if addition == "" {
			addition = "build_history"
		}
		if project == "" || repoPath == "" || ref == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 project、query repository 或 reference（tag 或 digest）"})
			return
		}
		if !harborArtifactAdditionAllowed(addition) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的 addition"})
			return
		}
		repoPath = harborNormalizeRepositoryForProject(project, repoPath)
		if repoPath == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 在去掉项目前缀后为空"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
		defer cancel()
		projEsc := url.PathEscape(project)
		segs := harborRepositoryPathSegmentCandidates(repoPath)
		if len(segs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 无效"})
			return
		}
		refEsc := url.PathEscape(ref)
		addEsc := url.PathEscape(addition)
		harborPath := "/projects/" + projEsc + "/repositories/" + segs[0] + "/artifacts/" + refEsc + "/additions/" + addEsc
		altPath := ""
		if len(segs) > 1 {
			altPath = "/projects/" + projEsc + "/repositories/" + segs[1] + "/artifacts/" + refEsc + "/additions/" + addEsc
		}
		b, code, err := harborDoGET404RepoAlt(ctx, cfg, harborPath, altPath)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		harborForwardHarborResponse(c, code, "application/json; charset=utf-8", b)
	}
}

func handleHarborArtifacts(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		project := strings.TrimSpace(c.Param("project"))
		repoPath := strings.Trim(strings.TrimSpace(c.Query("repository")), "/")
		if project == "" || repoPath == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 project 或 query 参数 repository（完整仓库名，如 nginx 或 group/nginx）"})
			return
		}
		repoPath = harborNormalizeRepositoryForProject(project, repoPath)
		if repoPath == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 在去掉项目前缀后为空"})
			return
		}
		q := url.Values{}
		if p := strings.TrimSpace(c.Query("page")); p != "" {
			q.Set("page", p)
		} else {
			q.Set("page", "1")
		}
		if ps := strings.TrimSpace(c.Query("page_size")); ps != "" {
			q.Set("page_size", ps)
		} else {
			q.Set("page_size", "30")
		}
		if typ := strings.TrimSpace(c.Query("type")); typ != "" {
			q.Set("type", typ)
		}
		if qs := strings.TrimSpace(c.Query("q")); qs != "" {
			q.Set("q", qs)
		}
		enc := q.Encode()
		projEsc := url.PathEscape(project)
		segs := harborRepositoryPathSegmentCandidates(repoPath)
		if len(segs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 无效"})
			return
		}
		harborPath := "/projects/" + projEsc + "/repositories/" + segs[0] + "/artifacts?" + enc
		altPath := ""
		if len(segs) > 1 {
			altPath = "/projects/" + projEsc + "/repositories/" + segs[1] + "/artifacts?" + enc
		}
		harborProxyCachedListGET(c, app, "/api/harbor/projects/:project/artifacts", "art", []string{project, repoPath, enc}, harborPath, altPath)
	}
}

func handleHarborDeleteArtifact(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if !harborConfiguredFromCfg(cfg) {
			c.JSON(http.StatusBadRequest, gin.H{"error": errHarborNotConfigured.Error()})
			return
		}
		project := strings.TrimSpace(c.Param("project"))
		repoPath := strings.Trim(strings.TrimSpace(c.Query("repository")), "/")
		ref := strings.TrimSpace(c.Query("reference"))
		if project == "" || repoPath == "" || ref == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 project、query repository 或 reference（digest 或 tag）"})
			return
		}
		repoPath = harborNormalizeRepositoryForProject(project, repoPath)
		if repoPath == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 在去掉项目前缀后为空"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 45*time.Second)
		defer cancel()
		projEsc := url.PathEscape(project)
		segs := harborRepositoryPathSegmentCandidates(repoPath)
		if len(segs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "repository 无效"})
			return
		}
		refEsc := url.PathEscape(ref)
		path := "/projects/" + projEsc + "/repositories/" + segs[0] + "/artifacts/" + refEsc
		altPath := ""
		if len(segs) > 1 {
			altPath = "/projects/" + projEsc + "/repositories/" + segs[1] + "/artifacts/" + refEsc
		}
		b, code, err := harborDoMethod404RepoAlt(ctx, cfg, http.MethodDelete, path, altPath, nil)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
			return
		}
		if code >= 200 && code < 300 {
			HarborCacheBustGen(context.Background(), app)
			go func(a *ServerApp) {
				ctx2, cancel := context.WithTimeout(context.Background(), time.Duration(harborIndexCrawlTimeoutSec())*time.Second)
				defer cancel()
				HarborIndexRefreshOnce(ctx2, a)
			}(app)
		}
		harborForwardHarborResponse(c, code, "application/json; charset=utf-8", b)
	}
}
