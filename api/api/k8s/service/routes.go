package service

import (
	"kube-bt-sync/common/appctx"
	legacycore "kube-bt-sync/common/core"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacycore.MountK8sRoutes(api, app)
}
