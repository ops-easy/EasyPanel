package router

import (
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	"github.com/ops-easy/EasyPanel/api/common/httpserver"
	"github.com/ops-easy/EasyPanel/api/router/appcenter"
	"github.com/ops-easy/EasyPanel/api/router/baota"
	"github.com/ops-easy/EasyPanel/api/router/compute"
	"github.com/ops-easy/EasyPanel/api/router/dns"
	"github.com/ops-easy/EasyPanel/api/router/docs"
	"github.com/ops-easy/EasyPanel/api/router/harbor"
	"github.com/ops-easy/EasyPanel/api/router/k8s"
	"github.com/ops-easy/EasyPanel/api/router/network"
	"github.com/ops-easy/EasyPanel/api/router/ops"
	"github.com/ops-easy/EasyPanel/api/router/pve"
	"github.com/ops-easy/EasyPanel/api/router/settings"
	"github.com/ops-easy/EasyPanel/api/router/system"
	"github.com/ops-easy/EasyPanel/api/router/tool"
	"github.com/ops-easy/EasyPanel/api/router/vcenter"

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
	compute.RegisterRoutes(api, app)
	vcenter.RegisterRoutes(api, app)
	pve.RegisterRoutes(api, app)
	network.RegisterRoutes(api, app)
	k8s.RegisterRoutes(api, app)
	ops.RegisterRoutes(r, api, app)
	system.RegisterRoutes(r, api, app)
	settings.RegisterRoutes(api, app)
}
