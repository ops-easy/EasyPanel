package k8s

import (
	"kube-bt-sync/api/k8s/controller"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(api)
}
