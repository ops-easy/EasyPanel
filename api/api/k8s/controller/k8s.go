package controller

import (
	"kube-bt-sync/api/k8s/service"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) RegisterRoutes(api *gin.RouterGroup) {
	service.RegisterRoutes(api, ctl.app)
}
