package service

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	core.RegisterSettingsRoutes(api, app)
}
