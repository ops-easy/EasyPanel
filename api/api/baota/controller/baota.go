package controller

import (
	"kube-bt-sync/api/baota/service"
	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) IngressSyncStatus(c *gin.Context) {
	service.IngressSyncStatus(ctl.app)(c)
}

func (ctl *Controller) IngressSyncRun(c *gin.Context) {
	service.IngressSyncRun(ctl.app)(c)
}
