package service

import (
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/legacy"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func PublicRoute(c *gin.Context, app *ServerApp) {
	legacy.HandleDocPublicRoute(c, app)
}

func PublicMedia(c *gin.Context, app *ServerApp) {
	legacy.HandleDocPublicMedia(c, app)
}

func RegisterAPIRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacy.RegisterDocsRoutes(api, app)
}
