package controller

import (
	appcentersvc "kube-bt-sync/api/appcenter/service"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *core.ServerApp
}

func New(app *core.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) RegisterRoutes(api *gin.RouterGroup) {
	appcentersvc.RegisterRedisRoutes(api, ctl.app)
	appcentersvc.RegisterKafkaRoutes(api, ctl.app)
	appcentersvc.RegisterOpenSearchRoutes(api, ctl.app)
	appcentersvc.RegisterOpenClawRoutes(api, ctl.app)
	appcentersvc.RegisterCloudVMRoutes(api, ctl.app)
}
