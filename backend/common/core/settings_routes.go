package core

import "github.com/gin-gonic/gin"

func RegisterSettingsRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/config", func(c *gin.Context) { handleGetConfig(c, app) })
	api.GET("/runtime/status", func(c *gin.Context) { handleGetRuntimeStatus(c, app) })
	api.GET("/system/check", func(c *gin.Context) { handleSystemCheck(c, app) })
	api.GET("/settings/runtime", handleGetRuntimeSettings(app))
	api.PUT("/settings/runtime", handlePutRuntimeSettings(app))
}
