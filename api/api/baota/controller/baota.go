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

func (ctl *Controller) IngressSyncStatus(c *gin.Context) {
	core.HandleBaotaIngressSyncStatus(ctl.app)(c)
}

func (ctl *Controller) IngressSyncRun(c *gin.Context) {
	core.HandleBaotaIngressSyncRun(ctl.app)(c)
}
