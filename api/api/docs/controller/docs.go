package controller

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *core.ServerApp
}

func New(app *core.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) PublicRoute(c *gin.Context) {
	core.HandleDocPublicRoute(c, ctl.app)
}

func (ctl *Controller) PublicMedia(c *gin.Context) {
	core.HandleDocPublicMedia(c, ctl.app)
}

func (ctl *Controller) RegisterAPIRoutes(api *gin.RouterGroup) {
	core.RegisterDocsRoutes(api, ctl.app)
}
