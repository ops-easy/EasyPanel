package baota

import (
	"github.com/ops-easy/EasyPanel/backend/api/baota/controller"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	api.GET("/baota/ingress-sync/status", ctl.IngressSyncStatus)
	api.POST("/baota/ingress-sync/run", ctl.IngressSyncRun)
}
