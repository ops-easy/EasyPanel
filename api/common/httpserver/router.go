package httpserver

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

// RegisterBaseRoutes keeps the legacy HTTP bootstrap behind a common boundary
// while domain routers continue moving out of internal.
func RegisterBaseRoutes(r *gin.Engine, app *appctx.ServerApp) *gin.RouterGroup {
	return core.RegisterLegacyRoutes(r, app)
}
