package httpserver

import (
	"log"

	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"

	"github.com/gin-gonic/gin"
)

func RegisterBaseRoutes(r *gin.Engine, app *appctx.ServerApp) *gin.RouterGroup {
	r.Use(gin.Recovery())
	cfg := app.Cfg()
	if cfg.PerformanceMode {
		gin.SetMode(gin.ReleaseMode)
		log.Printf("config: KUBEBT_PERFORMANCE_MODE enabled; namespace cache TTL=%d seconds", cfg.NamespacesCacheTTLSec)
	}
	core.ConfigureGinTrustedProxies(r, cfg)
	r.Use(core.AuditAccessLogMiddleware(app))
	r.GET("/metrics", func(c *gin.Context) {
		core.ServePrometheusMetrics(c.Writer, c.Request)
	})

	api := r.Group("/api")
	api.Use(core.DashboardAuthMiddleware(app))
	api.Use(core.ViewerRestrictionsMiddleware(app))
	api.Use(core.APIResponseCacheMiddleware(app))
	core.AttachCoreAPIRoutes(api, app)

	core.AttachFrontendRoutes(r, app)
	if app.Cfg().EnableBackgroundJobs {
		core.StartAuditRetentionPruner(app)
	}
	return api
}
