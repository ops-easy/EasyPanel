package ops

import (
	"github.com/ops-easy/EasyPanel/api/api/ops/controller"
	"github.com/ops-easy/EasyPanel/api/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(r, api)
}
