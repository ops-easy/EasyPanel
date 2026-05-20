package k8s

import (
	"kube-bt-sync/api/k8s/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	controller.New(app).RegisterRoutes(api)
}
