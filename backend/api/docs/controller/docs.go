package controller

import (
	"github.com/ops-easy/EasyPanel/backend/api/docs/service"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) PublicRoute(c *gin.Context) {
	service.PublicRoute(c, ctl.app)
}

func (ctl *Controller) PublicMedia(c *gin.Context) {
	service.PublicMedia(c, ctl.app)
}

func (ctl *Controller) RegisterAPIRoutes(api *gin.RouterGroup) {
	service.RegisterAPIRoutes(api, ctl.app)
}
