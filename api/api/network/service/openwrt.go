package service

import (
	"net/http"
	"strings"

	networkmodel "kube-bt-sync/api/network/model"

	"github.com/gin-gonic/gin"
)

type OpenWrtMetricFamilies = networkmodel.OpenWrtMetricFamilies

func openWrtMetricFamiliesFromNames(names []string) OpenWrtMetricFamilies {
	var f OpenWrtMetricFamilies
	for _, raw := range names {
		n := strings.TrimSpace(raw)
		switch {
		case n == "node_load1" || n == "node_memory_MemTotal_bytes" || n == "node_memory_MemAvailable_bytes":
			f.System = true
		case strings.HasPrefix(n, "node_network_receive_") || strings.HasPrefix(n, "node_network_transmit_") || n == "node_network_up":
			f.Interfaces = true
		case strings.Contains(n, "dhcp") || strings.Contains(n, "lease") || strings.Contains(n, "neigh"):
			f.DHCP = true
		case strings.Contains(n, "wifi") || strings.Contains(n, "wireless") || strings.Contains(n, "station_signal"):
			f.WiFi = true
		case strings.Contains(n, "netstat") || strings.Contains(n, "conntrack") || strings.Contains(n, "CurrEstab"):
			f.Netstat = true
		}
	}
	return f
}

func handleOpenWrtExporterStatus(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	handleOpenWrtExporterStatusForDevice(c, app, dev)
}

func handleOpenWrtExporterStatusForDevice(c *gin.Context, app *ServerApp, dev networkmodel.Device) {
	base := prometheusBaseForNetworkScope(app.Cfg(), dev.PrometheusScope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{
			"prometheusConfigured": false,
			"families":             OpenWrtMetricFamilies{},
			"missingHints":         OpenWrtMetricFamilies{}.MissingHints(),
		})
		return
	}
	match := `{__name__=~"node_.*|openwrt_.*"}`
	if dev.InstanceLabel != "" {
		match = `{instance="` + strings.ReplaceAll(dev.InstanceLabel, `"`, `\"`) + `",__name__=~"node_.*|openwrt_.*"}`
	}
	samples, err := promQueryInstant(base, `count by (__name__) (`+match+`)`)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	names := make([]string, 0, len(samples))
	for _, s := range samples {
		if n := strings.TrimSpace(s.Metric["__name__"]); n != "" {
			names = append(names, n)
		}
	}
	f := openWrtMetricFamiliesFromNames(names)
	c.JSON(http.StatusOK, gin.H{
		"prometheusConfigured": true,
		"families":             f,
		"missingHints":         f.MissingHints(),
		"metricNames":          names,
	})
}

func handleNetworkDeviceGenericEmpty(c *gin.Context, app *ServerApp, field string) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"device": dev,
		field:    []gin.H{},
		"note":   "第一版按 Prometheus 指标族探测展示；详细聚合将在前端图表中逐步补齐。",
	})
}
