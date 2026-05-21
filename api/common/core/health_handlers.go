package core

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// handleLoginPublicStatus GET /api/login/public-status — 无需登录；供登录页展示探活摘要（不返回宝塔面板 URL，避免泄露域名/端口）。
func handleLoginPublicStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		defer cancel()
		cfg := app.Cfg()
		out := buildSystemCheckResponse(ctx, app, DashboardRoleAdmin)
		if b, ok := out["baota"].(gin.H); ok {
			b["url"] = ""
			b["urlHidden"] = true
			out["baota"] = b
		}
		if d, ok := out["ddns"].(gin.H); ok {
			d["host"] = ""
			d["ips"] = []string{}
			d["hostHidden"] = true
			out["ddns"] = d
		}
		if k, ok := out["k8s"].(gin.H); ok {
			k["nodeIP"] = ""
			k["nodeHidden"] = true
			out["k8s"] = k
		}
		baotaConfigured := strings.TrimSpace(cfg.BaotaURL) != "" && strings.TrimSpace(cfg.BaotaAPIKey) != ""
		for _, target := range EffectiveBaotaTargets(cfg) {
			if strings.TrimSpace(target.URL) != "" && strings.TrimSpace(target.APIKey) != "" {
				baotaConfigured = true
				break
			}
		}
		c.JSON(http.StatusOK, gin.H{
			"systemCheck": out,
			"runtime": gin.H{
				"k8sConnected":             app.K8s() != nil,
				"k8sRuntimeConfigured":     app.Runtime() != nil && K8sRuntimeConfigured(app.Runtime()),
				"vcenterConfigured":        cfg.vCenterConfigured(),
				"vcenterRuntimeConfigured": VCenterRuntimeCredentialsPresent(cfg),
				"redisConfigured":          RedisAddrConfigured(cfg),
				"redisConnected":           app.Redis() != nil,
				"mysqlDsnConfigured":       strings.TrimSpace(cfg.MySQLDSN) != "",
				"mysqlReachable":           app.MySQLDB() != nil,
				"baotaConfigured":          baotaConfigured,
				"ddnsConfigured":           strings.TrimSpace(cfg.DDNSHost) != "",
				"ingressBaotaSyncEnabled":  cfg.IngressBaotaSyncEnabled,
				"syncIntervalSec":          int(cfg.SyncInterval.Seconds()),
			},
		})
	}
}

// handleHealth 无需登录：进程存活 + MySQL 连通性及库表结构版本（与发版后迁移一致时可对照 schemaAligned）。
func handleHealth(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()
		out := gin.H{
			"ok":                         true,
			"service":                    "kube-bt-sync",
			"buildVersion":               sessionBuildVersionSegment(),
			"mysqlSchemaVersionExpected": AppMySQLSchemaVersion,
			"mysql":                      GinHMySQLSchemaStatus(ctx, app),
		}
		c.JSON(http.StatusOK, out)
	}
}
