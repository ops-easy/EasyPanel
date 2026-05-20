package service

import (
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/legacy"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacy.RegisterVCenterRoutes(api, app)
}
