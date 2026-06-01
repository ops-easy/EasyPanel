package core

import "github.com/gin-gonic/gin"

func ServeDocPublicRoute(c *gin.Context, app *ServerApp) {
	HandleDocPublicRoute(c, app)
}

func ServeDocPublicMedia(c *gin.Context, app *ServerApp) {
	HandleDocPublicMedia(c, app)
}

func MountDocsAPIRoutes(api *gin.RouterGroup, app *ServerApp) {
	RegisterDocsRoutes(api, app)
}

func MountVCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	RegisterVCenterRoutes(api, app)
}

func MountK8sRoutes(api *gin.RouterGroup, app *ServerApp) {
	RegisterK8sRoutes(api, app)
}

func MountOpsRoutes(r *gin.Engine, api *gin.RouterGroup, app *ServerApp) {
	RegisterOpsPublicRoutes(r, app)
	RegisterOpsCenterRoutes(api, app)
}

func MountSettingsRoutes(api *gin.RouterGroup, app *ServerApp) {
	RegisterSettingsRoutes(api, app)
}

func MountSettingsRoutesWithHooks(api *gin.RouterGroup, app *ServerApp, hooks RuntimeSettingsHooks) {
	RegisterSettingsRoutesWithHooks(api, app, hooks)
}

func MountSystemRoutes(r *gin.Engine, api *gin.RouterGroup, app *ServerApp) {
	RegisterSystemPublicRoutes(r, app)
	RegisterSystemProtectedRoutes(api, app)
}
