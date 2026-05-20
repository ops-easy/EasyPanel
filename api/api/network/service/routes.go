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
	g.GET("/ikuai-client-stream", func(c *gin.Context) { handleNetworkIkuaiClientStream(c, app) })
	g.GET("/vm-mapping", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"mappings": []gin.H{}}) })
}

func handleNetworkDiscover(c *gin.Context, app *ServerApp) {
	c.JSON(http.StatusOK, gin.H{
		"devices": []gin.H{},
		"note":    "可手动登记 Prometheus instance；自动发现会根据 iKuai/OpenWrt 指标族逐步补全。",
	})
}
