package dns

import (
	"kube-bt-sync/api/dns/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	controller.RegisterRoutes(api, app)
}
