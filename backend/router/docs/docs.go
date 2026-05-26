package docs

import (
	"github.com/ops-easy/EasyPanel/backend/api/docs/controller"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	r.GET("/r/*rp", ctl.PublicRoute)
	r.POST("/r/*rp", ctl.PublicRoute)
	r.GET("/d/:token", ctl.PublicMedia)
	ctl.RegisterAPIRoutes(api)
}
