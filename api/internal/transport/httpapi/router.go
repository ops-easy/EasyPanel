package httpapi

import (
	core "kube-bt-sync/common/core"
	apirouter "kube-bt-sync/router"

	"github.com/gin-gonic/gin"
)

// NewRouter 构造 Dashboard HTTP 路由。
func NewRouter(app *core.ServerApp) *gin.Engine {
	r := gin.New()
	apirouter.RegisterRoutes(r, app)
	return r
}
