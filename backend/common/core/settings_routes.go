package core

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

type RuntimeSettingsHooks struct {
	InvalidateHarborCache func(context.Context, *ServerApp)
	RefreshHarborIndex    func(context.Context, *ServerApp)
	HarborIndexTimeout    func() time.Duration
}

func RegisterSettingsRoutes(api *gin.RouterGroup, app *ServerApp) {
	RegisterSettingsRoutesWithHooks(api, app, RuntimeSettingsHooks{})
}

func RegisterSettingsRoutesWithHooks(api *gin.RouterGroup, app *ServerApp, hooks RuntimeSettingsHooks) {
	api.GET("/config", func(c *gin.Context) { handleGetConfig(c, app) })
	api.GET("/runtime/status", func(c *gin.Context) { handleGetRuntimeStatus(c, app) })
	api.GET("/system/check", func(c *gin.Context) { handleSystemCheck(c, app) })
	api.GET("/settings/runtime", handleGetRuntimeSettings(app))
	api.PUT("/settings/runtime", handlePutRuntimeSettings(app, hooks))
}
