package docs

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *core.ServerApp) {
	_ = r
	_ = api
	_ = app
}
