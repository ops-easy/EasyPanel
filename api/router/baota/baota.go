package baota

import (
	"kube-bt-sync/api/baota/controller"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	api.GET("/baota/ingress-sync/status", ctl.IngressSyncStatus)
	api.POST("/baota/ingress-sync/run", ctl.IngressSyncRun)
}
