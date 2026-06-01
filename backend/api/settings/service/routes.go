package service

import (
	harborsvc "github.com/ops-easy/EasyPanel/backend/api/harbor/service"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	legacycore "github.com/ops-easy/EasyPanel/backend/common/core"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp

func RegisterRoutes(api *gin.RouterGroup, app *ServerApp) {
	legacycore.MountSettingsRoutesWithHooks(api, app, legacycore.RuntimeSettingsHooks{
		InvalidateHarborCache: harborsvc.HarborCacheBustGen,
		RefreshHarborIndex:    harborsvc.HarborIndexRefreshOnce,
		HarborIndexTimeout:    harborsvc.HarborIndexCrawlTimeout,
	})
}
