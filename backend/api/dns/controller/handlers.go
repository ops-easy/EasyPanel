package controller

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	baotasvc "github.com/ops-easy/EasyPanel/backend/api/baota/service"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	"github.com/ops-easy/EasyPanel/backend/common/authz"
	"github.com/ops-easy/EasyPanel/backend/common/result"

	"github.com/gin-gonic/gin"
	mysql "github.com/go-sql-driver/mysql"
)

// RegisterRoutes registers all /api/dns/* routes.
func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	g := api.Group("/dns")

	// Status / dashboard
	g.GET("/status", func(c *gin.Context) { handleDnsStatus(c, app) })

	// Accounts (DNS provider credentials)
	g.GET("/accounts", func(c *gin.Context) { handleDnsAccountList(c, app) })
	g.POST("/accounts", dnsMutationConfirmMiddleware("DNS account create"), func(c *gin.Context) { handleDnsAccountCreate(c, app) })
	g.GET("/accounts/:id", func(c *gin.Context) { handleDnsAccountGet(c, app) })
	g.PUT("/accounts/:id", dnsMutationConfirmMiddleware("DNS account update"), func(c *gin.Context) { handleDnsAccountUpdate(c, app) })
	g.DELETE("/accounts/:id", dnsMutationConfirmMiddleware("DNS account delete"), func(c *gin.Context) { handleDnsAccountDelete(c, app) })
	g.POST("/accounts/:id/test", func(c *gin.Context) { handleDnsAccountTest(c, app) })
	g.POST("/accounts/:id/sync-domains", dnsMutationConfirmMiddleware("DNS account domain sync"), func(c *gin.Context) { handleDnsAccountSyncDomains(c, app) })

	// Domains
	g.GET("/domains", func(c *gin.Context) { handleDnsDomainList(c, app) })
	g.POST("/domains", dnsMutationConfirmMiddleware("DNS domain create"), func(c *gin.Context) { handleDnsDomainCreate(c, app) })
	g.GET("/domains/:id", func(c *gin.Context) { handleDnsDomainGet(c, app) })
	g.PUT("/domains/:id", dnsMutationConfirmMiddleware("DNS domain update"), func(c *gin.Context) { handleDnsDomainUpdate(c, app) })
	g.DELETE("/domains/:id", dnsMutationConfirmMiddleware("DNS domain delete"), func(c *gin.Context) { handleDnsDomainDelete(c, app) })

	// DNS Records (synced to DB; also proxied to provider)
	g.GET("/domains/:id/records", func(c *gin.Context) { handleDnsRecordList(c, app) })
	g.POST("/domains/:id/records/sync", dnsMutationConfirmMiddleware("DNS record sync"), func(c *gin.Context) { handleDnsRecordSync(c, app) })
	g.POST("/domains/:id/records", dnsMutationConfirmMiddleware("DNS record create"), func(c *gin.Context) { handleDnsRecordCreate(c, app) })
	g.PUT("/domains/:id/records/:rid", dnsMutationConfirmMiddleware("DNS record update"), func(c *gin.Context) { handleDnsRecordUpdate(c, app) })
	g.DELETE("/domains/:id/records/:rid", dnsMutationConfirmMiddleware("DNS record delete"), func(c *gin.Context) { handleDnsRecordDelete(c, app) })
	g.POST("/domains/:id/records/:rid/status", dnsMutationConfirmMiddleware("DNS record status update"), func(c *gin.Context) { handleDnsRecordSetStatus(c, app) })

	// Failover / Health check tasks
	g.GET("/failover", func(c *gin.Context) { handleDnsFailoverList(c, app) })
	g.POST("/failover", dnsMutationConfirmMiddleware("DNS failover create"), func(c *gin.Context) { handleDnsFailoverCreate(c, app) })
	g.PUT("/failover/:id", dnsMutationConfirmMiddleware("DNS failover update"), func(c *gin.Context) { handleDnsFailoverUpdate(c, app) })
	g.DELETE("/failover/:id", dnsMutationConfirmMiddleware("DNS failover delete"), func(c *gin.Context) { handleDnsFailoverDelete(c, app) })
	g.GET("/failover/:id/logs", func(c *gin.Context) { handleDnsFailoverLogs(c, app) })
	g.POST("/failover/:id/check", dnsMutationConfirmMiddleware("DNS failover manual check"), func(c *gin.Context) { handleDnsFailoverCheck(c, app) })

	// Scheduled tasks
	g.GET("/scheduled", func(c *gin.Context) { handleDnsScheduledList(c, app) })
	g.POST("/scheduled", dnsMutationConfirmMiddleware("DNS scheduled task create"), func(c *gin.Context) { handleDnsScheduledCreate(c, app) })
	g.DELETE("/scheduled/:id", dnsMutationConfirmMiddleware("DNS scheduled task delete"), func(c *gin.Context) { handleDnsScheduledDelete(c, app) })

	// SSL Certificates
	g.GET("/certs", func(c *gin.Context) { handleDnsCertList(c, app) })
	g.POST("/certs", dnsMutationConfirmMiddleware("DNS certificate order create"), func(c *gin.Context) { handleDnsCertCreate(c, app) })
	g.GET("/certs/:id", func(c *gin.Context) { handleDnsCertGet(c, app) })
	g.DELETE("/certs/:id", dnsMutationConfirmMiddleware("DNS certificate order delete"), func(c *gin.Context) { handleDnsCertDelete(c, app) })
	g.POST("/certs/:id/apply", dnsMutationConfirmMiddleware("DNS certificate apply"), func(c *gin.Context) { handleDnsCertApply(c, app) })
	g.PATCH("/certs/:id/baota", dnsMutationConfirmMiddleware("DNS certificate Baota settings update"), func(c *gin.Context) { handleDnsCertUpdateBaota(c, app) })
	g.POST("/certs/:id/push-baota", dnsMutationConfirmMiddleware("DNS certificate push to Baota"), func(c *gin.Context) { handleDnsCertPushBaota(c, app) })
}

// ─────────────────────────── permission helpers ───────────────────────────

func dnsWriteDenied(c *gin.Context) bool {
	if authz.DashboardRoleFromGin(c) == authz.DashboardRoleAdmin {
		return false
	}
	eff := authz.EffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		return true
	}
	return eff.AppCenter == authz.ModuleAccessNone || eff.AppCenter == authz.ModuleAccessRO
}

func dnsRequireWrite(c *gin.Context) bool {
	if dnsWriteDenied(c) {
		result.PermissionDenied(c)
		return false
	}
	return true
}

func dnsRequireMySQL(c *gin.Context, app *appctx.ServerApp) *sql.DB {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未连接 MySQL，请配置 MYSQL_DSN 后重试"})
		return nil
	}
	return db
}

func dnsMutationConfirmed(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func dnsMutationConfirmedValue(value interface{}) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		return dnsMutationConfirmed(v)
	case float64:
		return v == 1
	case int:
		return v == 1
	default:
		return false
	}
}

func dnsMutationConfirmMiddleware(label string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if dnsMutationConfirmed(c.Query("confirm")) {
			c.Next()
			return
		}

		confirmed := false
		if c.Request.Body != nil {
			raw, err := io.ReadAll(c.Request.Body)
			if err == nil {
				c.Request.Body = io.NopCloser(bytes.NewReader(raw))
				if len(bytes.TrimSpace(raw)) > 0 {
					var body map[string]interface{}
					if json.Unmarshal(raw, &body) == nil {
						confirmed = dnsMutationConfirmedValue(body["confirm"])
					}
				}
			}
		}
		if confirmed {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": label + " requires explicit confirm=true"})
	}
}

// ─────────────────────────── status ───────────────────────────

func handleDnsStatus(c *gin.Context, app *appctx.ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"mysqlReachable": false})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	stats := dnsGetStats(ctx, db)
	byProvider := dnsCountDomainsByProvider(ctx, db)
	c.JSON(http.StatusOK, gin.H{
		"mysqlReachable": true,
		"stats":          stats,
		"byProvider":     byProvider,
	})
}

// ─────────────────────────── accounts ───────────────────────────

func handleDnsAccountList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsAccountList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsAccount{}
	}
	c.JSON(http.StatusOK, gin.H{"accounts": list})
}

func handleDnsAccountGet(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	acc, err := dnsAccountGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	// Parse config to mask secrets
	var cfg map[string]string
	_ = json.Unmarshal([]byte(acc.ConfigJSON), &cfg)
	for k, v := range cfg {
		if len(v) > 8 {
			cfg[k] = v[:4] + strings.Repeat("*", len(v)-8) + v[len(v)-4:]
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"id": acc.ID, "name": acc.Name, "provider": acc.Provider,
		"config": cfg, "remark": acc.Remark,
		"createdBy": acc.CreatedBy, "createdAt": acc.CreatedAt,
	})
}

func handleDnsAccountCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body struct {
		Name     string            `json:"name" binding:"required"`
		Provider string            `json:"provider" binding:"required"`
		Config   map[string]string `json:"config"`
		Remark   string            `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	if body.Config == nil {
		body.Config = map[string]string{}
	}
	cfgJSON, _ := json.Marshal(body.Config)
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	id, err := dnsAccountInsert(ctx, db, body.Name, body.Provider, string(cfgJSON), body.Remark, createdBy)
	if err != nil {
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "账号名称已存在"})
			return
		}
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "账号已创建"})
}

func handleDnsAccountUpdate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		Name     string            `json:"name" binding:"required"`
		Provider string            `json:"provider" binding:"required"`
		Config   map[string]string `json:"config"`
		Remark   string            `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Config == nil {
		body.Config = map[string]string{}
	}
	// Merge: if value contains "***", keep old value
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	old, err := dnsAccountGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	var oldCfg map[string]string
	_ = json.Unmarshal([]byte(old.ConfigJSON), &oldCfg)
	for k, v := range body.Config {
		if strings.Contains(v, "***") {
			if oldVal, ok := oldCfg[k]; ok {
				body.Config[k] = oldVal
			}
		}
	}
	cfgJSON, _ := json.Marshal(body.Config)
	if err := dnsAccountUpdate(ctx, db, id, body.Name, body.Provider, string(cfgJSON), body.Remark); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "账号已更新"})
}

func handleDnsAccountDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsAccountDelete(ctx, db, id); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "账号已删除"})
}

func handleDnsAccountTest(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		Domain string `json:"domain"`
	}
	_ = c.ShouldBindJSON(&body)
	testDomain := strings.TrimSpace(body.Domain)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	acc, err := dnsAccountGet(ctx, db, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}
	client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false, "error": err.Error()})
		return
	}
	if testDomain == "" {
		// No domain specified: verify credentials by listing domains (lightweight check)
		domains, err := client.ListDomains(ctx)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "message": "连接成功", "domainCount": len(domains)})
		return
	}
	records, err := client.ListRecords(ctx, testDomain)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "连接成功", "recordCount": len(records)})
}

// handleDnsAccountSyncDomains pulls the domain list from a provider and upserts
// them into dns_domains. Existing rows are never overwritten.
func handleDnsAccountSyncDomains(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	acc, err := dnsAccountGet(ctx, db, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "账号不存在"})
		return
	}
	client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	domainNames, err := client.ListDomains(ctx)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "从服务商拉取域名失败: " + err.Error()})
		return
	}
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)

	added := 0
	for _, name := range domainNames {
		_, isNew, uErr := dnsDomainUpsertFromProvider(ctx, db, name, id, createdBy)
		if uErr == nil && isNew {
			added++
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "同步完成",
		"total":   len(domainNames),
		"added":   added,
	})
}

// ─────────────────────────── domains ───────────────────────────

func handleDnsDomainList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsDomainList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsDomain{}
	}
	c.JSON(http.StatusOK, gin.H{"domains": list})
}

func handleDnsDomainGet(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	d, err := dnsDomainGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, d)
}

func handleDnsDomainCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body struct {
		Name      string `json:"name" binding:"required"`
		AccountID int    `json:"accountId" binding:"required"`
		IcpBeian  string `json:"icpBeian"`
		ExpireAt  string `json:"expireAt"`
		Remark    string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.Name = strings.TrimSpace(strings.ToLower(body.Name))
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	id, err := dnsDomainInsert(ctx, db, body.Name, body.AccountID, body.IcpBeian, body.ExpireAt, body.Remark, createdBy)
	if err != nil {
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "该域名已在此账号下添加"})
			return
		}
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "域名已添加"})
}

func handleDnsDomainUpdate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		Name      string `json:"name" binding:"required"`
		AccountID int    `json:"accountId" binding:"required"`
		IcpBeian  string `json:"icpBeian"`
		ExpireAt  string `json:"expireAt"`
		Remark    string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsDomainUpdate(ctx, db, id, body.Name, body.AccountID, body.IcpBeian, body.ExpireAt, body.Remark); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "域名已更新"})
}

func handleDnsDomainDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	_ = dnsRecordDeleteAllByDomain(ctx, db, id)
	if err := dnsDomainDelete(ctx, db, id); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "域名及其解析记录已删除"})
}

// ─────────────────────────── records ───────────────────────────

func handleDnsRecordList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsRecordListByDomain(ctx, db, domainID)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsRecord{}
	}
	c.JSON(http.StatusOK, gin.H{"records": list})
}

// handleDnsRecordSync pulls records from the DNS provider and saves to DB.
func handleDnsRecordSync(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	domain, err := dnsDomainGet(ctx, db, domainID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	acc, err := dnsAccountGet(ctx, db, domain.AccountID)
	if err != nil {
		result.Error500(c, "获取账号信息失败: "+err.Error())
		return
	}
	client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	records, err := client.ListRecords(ctx, domain.Name)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "从服务商拉取失败: " + err.Error()})
		return
	}
	_ = dnsRecordDeleteAllByDomain(ctx, db, domainID)
	for _, r := range records {
		_ = dnsRecordUpsert(ctx, db, DnsRecord{
			ID: r.ID, DomainID: domainID, RecordType: r.RecordType,
			Host: r.Host, Line: r.Line, Value: r.Value, TTL: r.TTL,
			MxPriority: r.MxPriority, Status: r.Status,
		})
	}
	c.JSON(http.StatusOK, gin.H{"message": "同步完成", "count": len(records)})
}

func handleDnsRecordCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		RecordType string `json:"recordType" binding:"required"`
		Host       string `json:"host" binding:"required"`
		Line       string `json:"line"`
		Value      string `json:"value" binding:"required"`
		TTL        int    `json:"ttl"`
		MxPriority int    `json:"mxPriority"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.TTL == 0 {
		body.TTL = 600
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	domain, err := dnsDomainGet(ctx, db, domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	acc, _ := dnsAccountGet(ctx, db, domain.AccountID)
	pr := DnsProviderRecord{
		RecordType: body.RecordType, Host: body.Host, Line: body.Line,
		Value: body.Value, TTL: body.TTL, MxPriority: body.MxPriority,
	}
	providerID := ""
	if acc != nil {
		client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
		if err == nil {
			if pid, err := client.AddRecord(ctx, domain.Name, pr); err == nil {
				providerID = pid
			}
		}
	}
	if providerID == "" {
		providerID = "local-" + strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	r := DnsRecord{
		ID: providerID, DomainID: domainID, RecordType: body.RecordType,
		Host: body.Host, Line: body.Line, Value: body.Value, TTL: body.TTL,
		MxPriority: body.MxPriority, Status: 1, Remark: body.Remark,
	}
	if err := dnsRecordUpsert(ctx, db, r); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": providerID, "message": "记录已添加"})
}

func handleDnsRecordUpdate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordID := c.Param("rid")
	var body struct {
		RecordType string `json:"recordType" binding:"required"`
		Host       string `json:"host" binding:"required"`
		Line       string `json:"line"`
		Value      string `json:"value" binding:"required"`
		TTL        int    `json:"ttl"`
		MxPriority int    `json:"mxPriority"`
		Remark     string `json:"remark"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.TTL == 0 {
		body.TTL = 600
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	domain, err := dnsDomainGet(ctx, db, domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	acc, _ := dnsAccountGet(ctx, db, domain.AccountID)
	pr := DnsProviderRecord{
		ID: recordID, RecordType: body.RecordType, Host: body.Host, Line: body.Line,
		Value: body.Value, TTL: body.TTL, MxPriority: body.MxPriority,
	}
	if acc != nil {
		client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
		if err == nil {
			_ = client.UpdateRecord(ctx, domain.Name, pr)
		}
	}
	r := DnsRecord{
		ID: recordID, DomainID: domainID, RecordType: body.RecordType,
		Host: body.Host, Line: body.Line, Value: body.Value, TTL: body.TTL,
		MxPriority: body.MxPriority, Status: 1, Remark: body.Remark,
	}
	if err := dnsRecordUpsert(ctx, db, r); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "记录已更新"})
}

func handleDnsRecordDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordID := c.Param("rid")
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	domain, err := dnsDomainGet(ctx, db, domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	acc, _ := dnsAccountGet(ctx, db, domain.AccountID)
	if acc != nil {
		client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
		if err == nil {
			_ = client.DeleteRecord(ctx, domain.Name, recordID)
		}
	}
	if err := dnsRecordDelete(ctx, db, recordID, domainID); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "记录已删除"})
}

func handleDnsRecordSetStatus(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	domainID, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	recordID := c.Param("rid")
	var body struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	domain, err := dnsDomainGet(ctx, db, domainID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "域名不存在"})
		return
	}
	acc, _ := dnsAccountGet(ctx, db, domain.AccountID)
	if acc != nil {
		client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
		if err == nil {
			_ = client.SetStatus(ctx, domain.Name, recordID, body.Enabled)
		}
	}
	status := 0
	if body.Enabled {
		status = 1
	}
	_, err = db.ExecContext(ctx, `UPDATE dns_records SET status=? WHERE id=? AND domain_id=?`, status, recordID, domainID)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "状态已更新"})
}

// ─────────────────────────── failover ───────────────────────────

func handleDnsFailoverList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsFailoverList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsFailoverTask{}
	}
	c.JSON(http.StatusOK, gin.H{"tasks": list})
}

func handleDnsFailoverCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body DnsFailoverTask
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.CheckInterval == 0 {
		body.CheckInterval = 60
	}
	if body.CheckTimeout == 0 {
		body.CheckTimeout = 10
	}
	if body.MaxErrors == 0 {
		body.MaxErrors = 3
	}
	user, _ := c.Get("dashboardUser")
	body.CreatedBy, _ = user.(string)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	id, err := dnsFailoverInsert(ctx, db, body)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "监测任务已创建"})
}

func handleDnsFailoverUpdate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body DnsFailoverTask
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.ID = id
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsFailoverUpdate(ctx, db, body); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "任务已更新"})
}

func handleDnsFailoverDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsFailoverDelete(ctx, db, id); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "任务已删除"})
}

func handleDnsFailoverLogs(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	logs, err := dnsFailoverLogList(ctx, db, id)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if logs == nil {
		logs = []DnsFailoverLog{}
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// handleDnsFailoverCheck performs an immediate health check.
func handleDnsFailoverCheck(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	tasks, err := dnsFailoverList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	var task *DnsFailoverTask
	for i := range tasks {
		if tasks[i].ID == id {
			task = &tasks[i]
			break
		}
	}
	if task == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "任务不存在"})
		return
	}
	if task.Status != 1 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "任务已停用"})
		return
	}
	transition, err := dnsExecuteFailoverTask(ctx, db, *task)
	if err != nil {
		result.Error500(c, "故障切换执行失败: "+err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":         transition.OK,
		"status":     transition.LastStatus,
		"action":     transition.Action,
		"errorCount": transition.ErrorCount,
		"message":    transition.Message,
	})
}

// ─────────────────────────── scheduled ───────────────────────────

func handleDnsScheduledList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsScheduledList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsScheduledTask{}
	}
	c.JSON(http.StatusOK, gin.H{"tasks": list})
}

func handleDnsScheduledCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body struct {
		Name        string `json:"name" binding:"required"`
		DomainID    int    `json:"domainId" binding:"required"`
		RecordID    string `json:"recordId"`
		Action      string `json:"action" binding:"required"`
		NewValue    string `json:"newValue"`
		ScheduledAt string `json:"scheduledAt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	t, err := time.Parse("2006-01-02T15:04:05", body.ScheduledAt)
	if err != nil {
		t, err = time.Parse("2006-01-02 15:04:05", body.ScheduledAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "scheduledAt 格式错误，请使用 2006-01-02T15:04:05"})
			return
		}
	}
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)
	task := DnsScheduledTask{
		Name: body.Name, DomainID: body.DomainID, RecordID: body.RecordID,
		Action: body.Action, NewValue: body.NewValue,
		ScheduledAt: t, CreatedBy: createdBy,
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	id, err := dnsScheduledInsert(ctx, db, task)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "定时任务已创建"})
}

func handleDnsScheduledDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsScheduledDelete(ctx, db, id); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "定时任务已删除"})
}

// ─────────────────────────── SSL certs ───────────────────────────

func handleDnsCertList(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	list, err := dnsCertOrderList(ctx, db)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if list == nil {
		list = []DnsCertOrder{}
	}
	c.JSON(http.StatusOK, gin.H{"certs": list})
}

func handleDnsCertGet(c *gin.Context, app *appctx.ServerApp) {
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	o, err := dnsCertOrderGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "证书不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, o)
}

func handleDnsCertCreate(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	var body struct {
		Name          string   `json:"name" binding:"required"`
		AccountID     int      `json:"accountId"`
		Domains       []string `json:"domains" binding:"required"`
		Email         string   `json:"email"`
		AutoRenew     bool     `json:"autoRenew"`
		BaotaSiteName string   `json:"baotaSiteName"`
		AutoPushBaota bool     `json:"autoPushBaota"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.AccountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 DNS 服务商账号"})
		return
	}
	domains, err := dnsNormalizeCertDomains(body.Domains)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if _, err := dnsAccountGet(ctx, db, body.AccountID); err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "DNS 服务商账号不存在"})
		return
	} else if err != nil {
		result.Error500(c, err.Error())
		return
	}
	domainsJSON, _ := json.Marshal(domains)
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)
	order := DnsCertOrder{
		Name: body.Name, AccountID: body.AccountID,
		Domains: string(domainsJSON),
		Email:   body.Email, AutoRenew: body.AutoRenew,
		BaotaSiteName: strings.TrimSpace(body.BaotaSiteName),
		AutoPushBaota: body.AutoPushBaota,
		CreatedBy:     createdBy,
	}
	id, err := dnsCertOrderInsert(ctx, db, order)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": id, "message": "证书申请单已创建，点击「申请」开始签发"})
}

func handleDnsCertDelete(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if err := dnsCertOrderDelete(ctx, db, id); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "证书记录已删除"})
}

// handleDnsCertApply triggers an ACME DNS-01 flow using the configured DNS account.
func handleDnsCertApply(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	order, err := dnsCertOrderGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "证书不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if order.AccountID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "证书申请单未绑定 DNS 服务商账号，请重新创建申请单"})
		return
	}
	domains, err := dnsCertOrderDomainList(order.Domains)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	acc, err := dnsAccountGet(ctx, db, order.AccountID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "DNS 服务商账号不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	zones, err := dnsDomainNamesByAccount(ctx, db, order.AccountID)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if len(zones) == 0 {
		zones, err = client.ListDomains(ctx)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "读取 DNS 服务商域名失败: " + err.Error()})
			return
		}
	}
	_ = dnsCertOrderUpdateStatus(ctx, db, id, "applying", "", "", nil, nil)
	issued, err := dnsCertIssueCertificate(ctx, dnsCertificateIssueRequest{
		Email:            order.Email,
		Domains:          domains,
		Zones:            zones,
		Provider:         client,
		DirectoryURL:     dnsACMEDirectoryURL(),
		PropagationDelay: dnsACMEPropagationDelay(),
	})
	if err != nil {
		_ = dnsCertOrderUpdateStatus(ctx, db, id, "failed", "", "", nil, nil)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":  "证书签发失败: " + err.Error(),
			"status": "failed",
		})
		return
	}
	issuedAt := issued.IssuedAt
	if issuedAt.IsZero() {
		issuedAt = time.Now()
	}
	expireAt := issued.ExpireAt
	if err := dnsCertOrderUpdateStatus(ctx, db, id, "issued", issued.CertPEM, issued.KeyPEM, &issuedAt, &expireAt); err != nil {
		result.Error500(c, err.Error())
		return
	}
	message := "证书已签发，已自动写入并清理 DNS-01 TXT 记录"
	if len(issued.CleanupErrors) > 0 {
		message += "；但部分临时 TXT 记录清理失败：" + strings.Join(issued.CleanupErrors, "；")
	}
	if order.AutoPushBaota && strings.TrimSpace(order.BaotaSiteName) != "" {
		if err := baotasvc.DeploySiteSSLPEM(app.Cfg(), strings.TrimSpace(order.BaotaSiteName), issued.CertPEM, issued.KeyPEM); err != nil {
			message += "；宝塔自动部署失败：" + err.Error()
		} else {
			message += "；已自动部署到宝塔站点 " + strings.TrimSpace(order.BaotaSiteName)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"message":    message,
		"status":     "issued",
		"expireAt":   expireAt,
		"dnsRecords": len(issued.DNSRecords),
	})
}

func handleDnsCertUpdateBaota(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		BaotaSiteName string `json:"baotaSiteName"`
		AutoPushBaota bool   `json:"autoPushBaota"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	if _, err := dnsCertOrderGet(ctx, db, id); err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "证书不存在"})
		return
	} else if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if err := dnsCertOrderUpdateBaota(ctx, db, id, body.BaotaSiteName, body.AutoPushBaota); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "宝塔关联设置已保存"})
}

func handleDnsCertPushBaota(c *gin.Context, app *appctx.ServerApp) {
	if !dnsRequireWrite(c) {
		return
	}
	cfg := app.Cfg()
	if len(baotasvc.EffectiveTargets(cfg)) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未配置宝塔实例（baotaTargets 或 BAOTA_URL / BAOTA_API_KEY），无法部署证书"})
		return
	}
	db := dnsRequireMySQL(c, app)
	if db == nil {
		return
	}
	id, err := dnsIDFromPath(c, "id")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		SiteName string `json:"siteName"`
	}
	_ = c.ShouldBindJSON(&body)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	order, err := dnsCertOrderGet(ctx, db, id)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "证书不存在"})
		return
	}
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	if order.Status != "issued" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅已签发的证书可部署到宝塔"})
		return
	}
	site := strings.TrimSpace(body.SiteName)
	if site == "" {
		site = strings.TrimSpace(order.BaotaSiteName)
	}
	if site == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写宝塔站点名（与面板「网站」列表中的站点名一致），或在证书上保存默认站点名"})
		return
	}
	if strings.TrimSpace(order.CertPEM) == "" || strings.TrimSpace(order.KeyPEM) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "证书 PEM 或私钥为空"})
		return
	}
	if err := baotasvc.DeploySiteSSLPEM(cfg, site, order.CertPEM, order.KeyPEM); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "证书已部署到宝塔站点「" + site + "」"})
}
