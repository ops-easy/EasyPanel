package legacy

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"

	"github.com/gin-gonic/gin"
)

func HandleDocPublicRoute(c *gin.Context, app *appctx.ServerApp) {
	core.HandleDocPublicRoute(c, app)
}

func HandleDocPublicMedia(c *gin.Context, app *appctx.ServerApp) {
	core.HandleDocPublicMedia(c, app)
}

func RegisterDocsRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterDocsRoutes(api, app)
}

func RegisterVCenterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterVCenterRoutes(api, app)
}

func RegisterK8sRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterK8sRoutes(api, app)
}

func RegisterOpsRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterOpsPublicRoutes(r, app)
	core.RegisterOpsCenterRoutes(api, app)
}

func RegisterSettingsRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterSettingsRoutes(api, app)
}

func RegisterSystemRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	core.RegisterSystemPublicRoutes(r, app)
	core.RegisterSystemProtectedRoutes(api, app)
}
