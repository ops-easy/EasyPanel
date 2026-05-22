package service

import (
	"net/http"
	"time"

	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func NowShanghaiRFC3339() string {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format(time.RFC3339Nano)
}

func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
	g := api.Group("/network")
	g.GET("/devices", func(c *gin.Context) { handleNetworkDevicesList(c, app) })
	g.POST("/devices", func(c *gin.Context) { handleNetworkDeviceCreate(c, app) })
	g.PUT("/devices/:id", func(c *gin.Context) { handleNetworkDeviceUpdate(c, app) })
	g.DELETE("/devices/:id", func(c *gin.Context) { handleNetworkDeviceDelete(c, app) })
	g.GET("/devices/discover", func(c *gin.Context) { handleNetworkDiscover(c, app) })
	g.GET("/devices/:id/overview", func(c *gin.Context) { handleNetworkDeviceOverview(c, app) })
	g.GET("/devices/:id/interfaces", func(c *gin.Context) { handleNetworkDeviceInterfaces(c, app) })
	g.GET("/devices/:id/clients", func(c *gin.Context) { handleNetworkDeviceClients(c, app) })
	g.GET("/devices/:id/traffic", func(c *gin.Context) { handleNetworkDeviceTraffic(c, app) })
	g.GET("/devices/:id/exporter-status", func(c *gin.Context) { handleOpenWrtExporterStatus(c, app) })

	g.POST("/devices/openwrt/probe", func(c *gin.Context) { handleOpenWrtProbe(c, app) })
	g.POST("/devices/ikuai/probe", func(c *gin.Context) { handleIkuaiProbe(c, app) })
	g.GET("/devices/:id/openwrt/overview", func(c *gin.Context) { handleOpenWrtOverview(c, app) })
	g.GET("/devices/:id/openwrt/interfaces", func(c *gin.Context) { handleOpenWrtInterfaces(c, app) })
	g.GET("/devices/:id/openwrt/clients", func(c *gin.Context) { handleOpenWrtClients(c, app) })
	g.GET("/devices/:id/openwrt/wireless", func(c *gin.Context) { handleOpenWrtWireless(c, app) })
	g.GET("/devices/:id/openwrt/firewall", func(c *gin.Context) { handleOpenWrtFirewall(c, app) })
	g.POST("/devices/:id/openwrt/actions", func(c *gin.Context) { handleOpenWrtAction(c, app) })
	g.POST("/devices/:id/openwrt/config/dry-run", func(c *gin.Context) { handleOpenWrtConfigDryRun(c, app) })
	g.POST("/devices/:id/openwrt/config/apply", func(c *gin.Context) { handleOpenWrtConfigApply(c, app) })
	g.GET("/devices/:id/:provider/config/:domain", func(c *gin.Context) { handleProviderConfigSnapshot(c, app) })
	g.POST("/devices/:id/:provider/config/:domain/dry-run", func(c *gin.Context) { handleProviderConfigDryRun(c, app) })
	g.POST("/devices/:id/:provider/config/:domain/apply", func(c *gin.Context) { handleProviderConfigApply(c, app) })
	g.POST("/devices/:id/:provider/actions", func(c *gin.Context) { handleProviderAction(c, app) })

	g.GET("/ikuai-client-stream", func(c *gin.Context) { handleNetworkIkuaiClientStream(c, app) })
	g.GET("/vm-mapping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"mappings": []gin.H{}, "source": "not-configured"}) })
}

func handleNetworkDiscover(c *gin.Context, app *ServerApp) {
	c.JSON(http.StatusOK, gin.H{
		"devices": []gin.H{},
		"note":    "请在 OpenWrt 或 iKuai 目标页保存设备连接信息；自动发现会在接入真实扫描源后启用。",
	})
}
