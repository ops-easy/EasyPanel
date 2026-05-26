package tool

import (
	"github.com/ops-easy/EasyPanel/api/api/tool/controller"
	"github.com/ops-easy/EasyPanel/api/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.RegisterRoutes(api, app)
}
