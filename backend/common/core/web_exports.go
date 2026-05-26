package core

import "github.com/gin-gonic/gin"

// AttachCoreAPIRoutes 挂载仍归 core 包维护的生产 API。
// 新业务域优先放到 backend/<domain> 与 router/<domain>，再由 backend/router/router.go 聚合。
func AttachCoreAPIRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/namespaces", func(c *gin.Context) { handleGetNamespaces(c, app) })
	api.GET("/services", func(c *gin.Context) { handleGetServices(c, app.K8s()) })
	api.GET("/ingresses", func(c *gin.Context) { handleListAllIngresses(c, app.K8s(), app.Cfg()) })
	api.GET("/status", func(c *gin.Context) { handleGetStatus(c, app.K8s(), app.Cfg()) })
	api.GET("/ingress/raw", func(c *gin.Context) { handleGetIngressRaw(c, app.K8s()) })
	api.POST("/ingress/yaml", func(c *gin.Context) { handleApplyYaml(c, app.K8s()) })
	api.POST("/ingress/delete", func(c *gin.Context) { handleDeleteIngress(c, app.K8s(), app.Cfg()) })
	api.GET("/prometheus/status", func(c *gin.Context) { handlePrometheusStatus(c, app.Cfg()) })
	api.GET("/prometheus/discover", func(c *gin.Context) { handlePrometheusDiscover(c, app.K8s()) })
	api.POST("/prometheus/source", func(c *gin.Context) { handlePrometheusSource(c, app.Cfg()) })
	api.GET("/prometheus/query", func(c *gin.Context) { handlePrometheusQuery(c, app) })
	api.POST("/prometheus/query", func(c *gin.Context) { handlePrometheusQuery(c, app) })
	api.GET("/prometheus/query_range", func(c *gin.Context) { handlePrometheusQueryRange(c, app) })
	api.POST("/prometheus/query_range", func(c *gin.Context) { handlePrometheusQueryRange(c, app) })
	api.POST("/prometheus/validate-config-yaml", func(c *gin.Context) { handlePrometheusConfigYAMLValidate(c) })
	api.GET("/prometheus/vcenter-metrics", func(c *gin.Context) { handleVCenterPrometheusMetrics(c, app) })

	registerCloudHostRoutes(api, app)
}

func AttachFrontendRoutes(r *gin.Engine, app *ServerApp) {
	registerFrontendRoutes(r, app)
}
