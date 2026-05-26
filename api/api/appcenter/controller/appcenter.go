package controller

import (
	appcentersvc "github.com/ops-easy/EasyPanel/api/api/appcenter/service"
	"github.com/ops-easy/EasyPanel/api/common/appctx"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	app *appctx.ServerApp
}

func New(app *appctx.ServerApp) *Controller {
	return &Controller{app: app}
}

func (ctl *Controller) RegisterRoutes(api *gin.RouterGroup) {
	appcentersvc.RegisterRedisRoutes(api, ctl.app)
	appcentersvc.RegisterMySQLRoutes(api, ctl.app)
	appcentersvc.RegisterKafkaRoutes(api, ctl.app)
	appcentersvc.RegisterOpenSearchRoutes(api, ctl.app)
	appcentersvc.RegisterOpenClawRoutes(api, ctl.app)
	appcentersvc.RegisterHermesRoutes(api, ctl.app)
	appcentersvc.RegisterCloudVMRoutes(api, ctl.app)
}
