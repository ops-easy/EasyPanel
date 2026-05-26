package service

import (
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	legacycore "github.com/ops-easy/EasyPanel/backend/common/core"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func PublicRoute(c *gin.Context, app *ServerApp) {
	legacycore.ServeDocPublicRoute(c, app)
}

func PublicMedia(c *gin.Context, app *ServerApp) {
	legacycore.ServeDocPublicMedia(c, app)
}

func RegisterAPIRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacycore.MountDocsAPIRoutes(api, app)
}
