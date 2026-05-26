package settings

import (
	"github.com/ops-easy/EasyPanel/api/api/settings/controller"
	"github.com/ops-easy/EasyPanel/api/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(api)
}
