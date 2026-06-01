package service

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func handleAppHermesBootstrapGet(c *gin.Context, app *ServerApp) {
	c.JSON(http.StatusOK, loadHermesBootstrap(app.PlatformKV()))
}

func handleAppHermesBootstrapPut(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	if !requireAppCenterMutationConfirm(c, appCenterMutationConfirmed(c.Query("confirm")), "Hermes bootstrap") {
		return
	}
	var body HermesBootstrap
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, err := normalizeHermesMode(body.DefaultMode); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	body.DefaultNamespace = strings.TrimSpace(body.DefaultNamespace)
	body.DefaultImage = normalizeHermesImage(body.DefaultImage)
	body.DefaultStorageSize = strings.TrimSpace(body.DefaultStorageSize)
	if body.DefaultNamespace == "" || body.DefaultImage == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "defaultNamespace 与 defaultImage 不能为空"})
		return
	}
	body.BootstrapComplete = true
	if len(body.Modes) == 0 {
		body.Modes = defaultHermesBootstrap().Modes
	}
	if err := saveHermesBootstrap(app.PlatformKV(), &body); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	mirrorPlatformKVIfDualWrite(app)
	SetAuditDetail(c, "应用中心 Hermes 更新引导配置 namespace="+body.DefaultNamespace+" mode="+body.DefaultMode+" image="+body.DefaultImage)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
