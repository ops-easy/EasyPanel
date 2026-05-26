package tool

import (
	"github.com/ops-easy/EasyPanel/backend/api/tool/controller"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.RegisterRoutes(api, app)
}
