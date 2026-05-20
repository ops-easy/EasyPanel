package baota

import (
	"kube-bt-sync/api/baota/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	ctl := controller.New(app)
	api.GET("/baota/ingress-sync/status", ctl.IngressSyncStatus)
	api.POST("/baota/ingress-sync/run", ctl.IngressSyncRun)
}
