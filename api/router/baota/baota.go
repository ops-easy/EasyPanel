package baota

import (
	"github.com/ops-easy/EasyPanel/api/api/baota/controller"
	"github.com/ops-easy/EasyPanel/api/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	api.GET("/baota/ingress-sync/status", ctl.IngressSyncStatus)
	api.POST("/baota/ingress-sync/run", ctl.IngressSyncRun)
}
