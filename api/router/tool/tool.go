package tool

import (
	"kube-bt-sync/api/tool/controller"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.RegisterRoutes(api, app)
}
