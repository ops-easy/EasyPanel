package appcenter

import (
	core "kube-bt-sync/internal"
	legacy "kube-bt-sync/internal/modules/appcenter"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	legacy.RegisterRoutes(api, app)
}
