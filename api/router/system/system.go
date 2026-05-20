package system

import (
	"kube-bt-sync/api/system/controller"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(r, api)
}
