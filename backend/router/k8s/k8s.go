package k8s

import (
	"github.com/ops-easy/EasyPanel/backend/api/k8s/controller"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	controller.New(app).RegisterRoutes(api)
}
