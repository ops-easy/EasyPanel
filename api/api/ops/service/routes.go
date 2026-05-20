package service

import (
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/legacy"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(r *gin.Engine, api *gin.RouterGroup, app *ServerApp) {
	legacy.RegisterOpsRoutes(r, api, app)
}
