package controller

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	g := api.Group("/toolbox")
	registerIPScanRoutes(g, app)
}
