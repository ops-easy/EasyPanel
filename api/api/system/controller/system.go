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

func (ctl *Controller) RegisterRoutes(r *gin.Engine, api *gin.RouterGroup) {
	core.RegisterSystemPublicRoutes(r, ctl.app)
	core.RegisterSystemProtectedRoutes(api, ctl.app)
}
