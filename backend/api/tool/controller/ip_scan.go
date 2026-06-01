package controller

import (
	"errors"
	"net/http"
	"strings"

	toolmodel "github.com/ops-easy/EasyPanel/backend/api/tool/model"
	toolsvc "github.com/ops-easy/EasyPanel/backend/api/tool/service"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	"github.com/ops-easy/EasyPanel/backend/common/result"

	"github.com/gin-gonic/gin"
)

func toolboxConfirm(raw string) bool {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "y":
		return true
	default:
		return false
	}
}

func requireToolboxConfirm(c *gin.Context, confirmed bool, label string) bool {
	if confirmed {
		return true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": label + " requires confirm=true"})
	return false
}

func handleToolboxIPScanConfigGet(c *gin.Context, app *appctx.ServerApp) {
	segs, err := toolsvc.LoadSegments(app)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"segments": segs})
}

func handleToolboxIPScanConfigPut(c *gin.Context, app *appctx.ServerApp) {
	var body toolmodel.IPScanConfigPut
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求 JSON 无效: " + err.Error()})
		return
	}
	if !requireToolboxConfirm(c, body.Confirm, "IP scan config update") {
		return
	}
	norm, err := toolsvc.NormalizeSegments(body.Segments)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := toolsvc.SaveSegments(app, norm); err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"segments": norm})
}

func handleToolboxIPScanRun(c *gin.Context, app *appctx.ServerApp) {
	var body toolmodel.IPScanRunBody
	_ = c.ShouldBindJSON(&body)
	if !requireToolboxConfirm(c, body.Confirm || toolboxConfirm(c.Query("confirm")), "IP scan run") {
		return
	}
	segment := strings.TrimSpace(body.Segment)
	if segment == "" {
		segs, err := toolsvc.LoadSegments(app)
		if err != nil {
			result.Error500(c, err.Error())
			return
		}
		if len(segs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先保存至少一个网段，或在请求中指定 segment"})
			return
		}
		segment = segs[0]
	}
	run, err := toolsvc.RunScan(app, segment)
	if errors.Is(err, toolsvc.ErrIPScanBusy) {
		c.JSON(http.StatusConflict, gin.H{"error": "已有扫描任务在执行，请稍后再试"})
		return
	}
	if errors.Is(err, toolsvc.ErrIPScanHistorySave) {
		result.Error500(c, err.Error())
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"run": run})
}

func handleToolboxIPScanHistory(c *gin.Context, app *appctx.ServerApp) {
	runs, err := toolsvc.LoadHistory(app)
	if err != nil {
		result.Error500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"runs": runs})
}

func registerIPScanRoutes(g *gin.RouterGroup, app *appctx.ServerApp) {
	g.GET("/ip-scan/config", func(c *gin.Context) { handleToolboxIPScanConfigGet(c, app) })
	g.PUT("/ip-scan/config", func(c *gin.Context) { handleToolboxIPScanConfigPut(c, app) })
	g.POST("/ip-scan/run", func(c *gin.Context) { handleToolboxIPScanRun(c, app) })
	g.GET("/ip-scan/history", func(c *gin.Context) { handleToolboxIPScanHistory(c, app) })
}
