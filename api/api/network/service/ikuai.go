package service

import (
	"net/http"
	"strings"

	networkmodel "kube-bt-sync/api/network/model"

	"github.com/gin-gonic/gin"
)

const ikuaiModernRecvJoin = `(ikuai_network_recv_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`
const ikuaiModernSendJoin = `(ikuai_network_send_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`

func handleNetworkIkuaiClientStream(c *gin.Context, app *ServerApp) {
	scope := strings.TrimSpace(c.DefaultQuery("scope", "vcenter"))
	base := prometheusBaseForNetworkScope(app.Cfg(), scope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{
			"prometheusConfigured": false,
			"ratesByIp":            gin.H{},
			"devices":              []gin.H{},
			"note":                 "未配置 Prometheus（network/vcenter/default scope 均为空）",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"prometheusConfigured": true,
		"ratesByIp":            gin.H{},
		"devices":              []gin.H{},
		"exporterKind":         "unknown",
		"note":                 "Network 模块已接管 iKuai 数据源；详细图表通过前端 Prometheus 查询展示。",
		"queriesUsed": gin.H{
			"downloadByIp": `max by (ip_addr) (` + ikuaiModernRecvJoin + `)`,
			"uploadByIp":   `max by (ip_addr) (` + ikuaiModernSendJoin + `)`,
		},
	})
}

func handleNetworkDeviceOverview(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	switch dev.Kind {
	case "openwrt":
		handleOpenWrtExporterStatusForDevice(c, app, dev)
	case "ikuai":
		c.JSON(http.StatusOK, gin.H{"device": dev, "kind": "ikuai"})
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的网络设备类型"})
	}
}

func networkDeviceByID(c *gin.Context, app *ServerApp) (networkmodel.Device, bool) {
	list, err := loadNetworkDevices(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return networkmodel.Device{}, false
	}
	dev, _ := findNetworkDevice(list, c.Param("id"))
	if dev == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "网络设备不存在"})
		return networkmodel.Device{}, false
	}
	return *dev, true
}
