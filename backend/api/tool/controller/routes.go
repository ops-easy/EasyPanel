package controller

import (
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	g := api.Group("/toolbox")
	registerIPScanRoutes(g, app)
}
