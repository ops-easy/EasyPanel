package router

import (
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/httpserver"
	"kube-bt-sync/router/appcenter"
	"kube-bt-sync/router/baota"
	"kube-bt-sync/router/dns"
	"kube-bt-sync/router/docs"
	"kube-bt-sync/router/harbor"
	"kube-bt-sync/router/k8s"
	"kube-bt-sync/router/ops"
	"kube-bt-sync/router/settings"
	"kube-bt-sync/router/system"
	"kube-bt-sync/router/tool"
	"kube-bt-sync/router/vcenter"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, app *appctx.ServerApp) {
	api := httpserver.RegisterBaseRoutes(r, app)

	appcenter.RegisterRoutes(api, app)
	tool.RegisterRoutes(api, app)
	dns.RegisterRoutes(api, app)

	harbor.RegisterRoutes(api, app)
	baota.RegisterRoutes(api, app)
	docs.RegisterRoutes(r, api, app)
	vcenter.RegisterRoutes(api, app)
	k8s.RegisterRoutes(api, app)
	ops.RegisterRoutes(r, api, app)
	system.RegisterRoutes(r, api, app)
	settings.RegisterRoutes(api, app)
}
