package httpapi

import (
	core "kube-bt-sync/internal"
	"kube-bt-sync/internal/modules/appcenter"
	"kube-bt-sync/internal/modules/dns"
	"kube-bt-sync/internal/modules/toolbox"

	"github.com/gin-gonic/gin"
)

// NewRouter 构造 Dashboard HTTP 路由。
func NewRouter(app *core.ServerApp) *gin.Engine {
	r := gin.New()
	api := core.RegisterLegacyRoutes(r, app)
	appcenter.RegisterRoutes(api, app)
	toolbox.RegisterRoutes(api, app)
	dns.RegisterRoutes(api, app)
	return r
}
