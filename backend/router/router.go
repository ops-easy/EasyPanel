package router

import (
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	"github.com/ops-easy/EasyPanel/backend/common/httpserver"
	"github.com/ops-easy/EasyPanel/backend/router/appcenter"
	"github.com/ops-easy/EasyPanel/backend/router/baota"
	"github.com/ops-easy/EasyPanel/backend/router/compute"
	"github.com/ops-easy/EasyPanel/backend/router/dns"
	"github.com/ops-easy/EasyPanel/backend/router/docs"
	"github.com/ops-easy/EasyPanel/backend/router/harbor"
	"github.com/ops-easy/EasyPanel/backend/router/k8s"
	"github.com/ops-easy/EasyPanel/backend/router/network"
	"github.com/ops-easy/EasyPanel/backend/router/ops"
	"github.com/ops-easy/EasyPanel/backend/router/pve"
	"github.com/ops-easy/EasyPanel/backend/router/settings"
	"github.com/ops-easy/EasyPanel/backend/router/system"
	"github.com/ops-easy/EasyPanel/backend/router/tool"
	"github.com/ops-easy/EasyPanel/backend/router/vcenter"

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
