package service

import (
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	legacycore "github.com/ops-easy/EasyPanel/api/common/core"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacycore.MountK8sRoutes(api, app)
}
