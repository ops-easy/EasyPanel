package service

import (
	"net/http"
	"strings"

	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type ServerApp = appctx.ServerApp
type Config = appctx.Config
type BaotaIngressSyncReport = core.BaotaIngressSyncReport

func IngressSyncStatus(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		rep, ok := core.LoadBaotaIngressSyncReport(app.PlatformKV())
		if !ok || rep == nil {
			c.JSON(http.StatusOK, gin.H{
				"ok":     true,
				"report": nil,
				"hint":   "尚无同步记录；开启定时同步或点击“立即同步到宝塔”后将在此展示进度与每步重试次数。",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "report": rep})
	}
}

func IngressSyncRun(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := app.Cfg()
		if app.K8s() == nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "K8s 未连接"})
			return
		}
		if len(EffectiveTargets(cfg)) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "未配置宝塔 URL 或 API Key"})
			return
		}
		rep := core.RunBaotaIngressSync(c.Request.Context(), app, "manual")
		if rep.Skipped && strings.Contains(rep.SkipReason, "已有同步任务") {
			c.JSON(http.StatusConflict, gin.H{"ok": false, "report": rep, "error": rep.SkipReason})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true, "report": rep})
	}
}
