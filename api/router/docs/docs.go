package docs

import (
	"kube-bt-sync/api/docs/controller"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *core.ServerApp) {
	ctl := controller.New(app)
	r.GET("/r/*rp", ctl.PublicRoute)
	r.POST("/r/*rp", ctl.PublicRoute)
	r.GET("/d/:token", ctl.PublicMedia)
	ctl.RegisterAPIRoutes(api)
}
