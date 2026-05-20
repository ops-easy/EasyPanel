package docs

import (
	"kube-bt-sync/api/docs/controller"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *appctx.ServerApp) {
	ctl := controller.New(app)
	r.GET("/r/*rp", ctl.PublicRoute)
	r.POST("/r/*rp", ctl.PublicRoute)
	r.GET("/d/:token", ctl.PublicMedia)
	ctl.RegisterAPIRoutes(api)
}
