package controller

import (
	"kube-bt-sync/api/ops/service"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) RegisterRoutes(r *gin.Engine, api *gin.RouterGroup) {
	service.RegisterRoutes(r, api, ctl.app)
}
