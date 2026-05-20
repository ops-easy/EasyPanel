package ops

import (
	"kube-bt-sync/api/ops/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *core.ServerApp) {
	controller.New(app).RegisterRoutes(r, api)
}
