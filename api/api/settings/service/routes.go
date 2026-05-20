package service

import (
	"context"

	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	core.RegisterSettingsRoutes(api, app)
}

func StartCrossPodRuntimeSync(ctx context.Context, getApp func() *ServerApp) {
	core.StartCrossPodRuntimeSync(ctx, getApp)
}

func StartRuntimeStatusRefresher(app *ServerApp) {
	core.StartRuntimeStatusRefresher(app)
}
