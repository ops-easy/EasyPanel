package service

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func PublicRoute(c *gin.Context, app *ServerApp) {
	core.HandleDocPublicRoute(c, app)
}

func PublicMedia(c *gin.Context, app *ServerApp) {
	core.HandleDocPublicMedia(c, app)
}

func RegisterAPIRoutes(api *gin.RouterGroup, app *ServerApp) {
	core.RegisterDocsRoutes(api, app)
}
