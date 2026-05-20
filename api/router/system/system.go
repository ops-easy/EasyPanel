package system

import (
	"kube-bt-sync/api/system/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *core.ServerApp) {
	controller.New(app).RegisterRoutes(r, api)
}
