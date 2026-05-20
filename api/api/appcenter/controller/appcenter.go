package controller

import (
	appcentersvc "kube-bt-sync/api/appcenter/service"
	core "kube-bt-sync/internal"
	"kube-bt-sync/internal/modules/appcenter/kafka"
	"kube-bt-sync/internal/modules/appcenter/openclaw"
	"kube-bt-sync/internal/modules/appcenter/opensearch"

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
	kafka.RegisterRoutes(api, ctl.app)
	opensearch.RegisterRoutes(api, ctl.app)
	openclaw.RegisterRoutes(api, ctl.app)
	appcentersvc.RegisterCloudVMRoutes(api, ctl.app)
}
