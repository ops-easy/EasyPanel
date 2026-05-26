package settings

import (
	"github.com/ops-easy/EasyPanel/backend/api/settings/controller"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(api)
}
