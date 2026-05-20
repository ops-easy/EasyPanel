package service

import (
	"kube-bt-sync/common/appctx"
	legacycore "kube-bt-sync/common/core"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *ServerApp) {
	legacycore.MountOpsRoutes(r, api, app)
}
