package service

import (
	"net/http"
	"sort"
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

func handleNetworkDeviceInterfaces(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind != "openwrt" {
		c.JSON(http.StatusOK, gin.H{"device": dev, "interfaces": []gin.H{}, "note": "iKuai 接口图表由 iKuai 监控页展示"})
		return
	}
	base := prometheusBaseForNetworkScope(app.Cfg(), dev.PrometheusScope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "device": dev, "interfaces": []gin.H{}, "missingHints": OpenWrtMetricFamilies{}.MissingHints()})
		return
	}
	rx, _ := promQueryInstant(base, `rate(`+openWrtMetric(dev, "node_network_receive_bytes_total")+`[5m])`)
	tx, _ := promQueryInstant(base, `rate(`+openWrtMetric(dev, "node_network_transmit_bytes_total")+`[5m])`)
	up, _ := promQueryInstant(base, openWrtMetric(dev, "node_network_up"))
	rows := map[string]gin.H{}
	mergeOpenWrtInterfaceSamples(rows, rx, "rxBytesPerSecond")
	mergeOpenWrtInterfaceSamples(rows, tx, "txBytesPerSecond")
	mergeOpenWrtInterfaceSamples(rows, up, "up")
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.TrimSpace(out[i]["name"].(string)) < strings.TrimSpace(out[j]["name"].(string))
	})
	c.JSON(http.StatusOK, gin.H{"prometheusConfigured": true, "device": dev, "interfaces": out})
}

func handleNetworkDeviceClients(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind != "openwrt" {
		c.JSON(http.StatusOK, gin.H{"device": dev, "clients": []gin.H{}, "note": "iKuai 客户端由 iKuai 监控页展示"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"device":       dev,
		"clients":      []gin.H{},
		"missingHints": OpenWrtMetricFamilies{System: true, Interfaces: true, Netstat: true}.MissingHints(),
		"note":         "OpenWrt DHCP/邻居表指标名称随 exporter collector 变化较大，当前先返回指标族提示。",
	})
}

func handleNetworkDeviceTraffic(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind != "openwrt" {
		c.JSON(http.StatusOK, gin.H{"device": dev, "traffic": []gin.H{}, "note": "iKuai 协议流量由 iKuai 监控页展示"})
		return
	}
	base := prometheusBaseForNetworkScope(app.Cfg(), dev.PrometheusScope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "device": dev, "traffic": []gin.H{}, "missingHints": OpenWrtMetricFamilies{}.MissingHints()})
		return
	}
	queries := []string{
		openWrtMetric(dev, "node_netstat_Tcp_CurrEstab"),
		openWrtMetric(dev, "node_nf_conntrack_entries"),
		openWrtMetric(dev, "node_netstat_Tcp_ActiveOpens"),
		openWrtMetric(dev, "node_netstat_Tcp_PassiveOpens"),
	}
	out := []gin.H{}
	for _, q := range queries {
		samples, err := promQueryInstant(base, q)
		if err != nil {
			continue
		}
		for _, s := range samples {
			name := strings.TrimSpace(s.Metric["__name__"])
			if name == "" {
				name = q
			}
			out = append(out, gin.H{"metric": name, "value": s.Value, "labels": s.Metric})
		}
	}
	c.JSON(http.StatusOK, gin.H{"prometheusConfigured": true, "device": dev, "traffic": out})
}

func openWrtMetric(dev networkmodel.Device, metric string) string {
	matchers := []string{}
	if strings.TrimSpace(dev.InstanceLabel) != "" {
		matchers = append(matchers, `instance="`+promLabelEscape(dev.InstanceLabel)+`"`)
	}
	if strings.TrimSpace(dev.JobLabel) != "" {
		matchers = append(matchers, `job="`+promLabelEscape(dev.JobLabel)+`"`)
	}
	if len(matchers) == 0 {
		return metric
	}
	return metric + "{" + strings.Join(matchers, ",") + "}"
}

func promLabelEscape(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	return strings.ReplaceAll(v, `"`, `\"`)
}

func mergeOpenWrtInterfaceSamples(rows map[string]gin.H, samples []promSample, field string) {
	for _, s := range samples {
		name := strings.TrimSpace(s.Metric["device"])
		if name == "" {
			name = strings.TrimSpace(s.Metric["iface"])
		}
		if name == "" {
			continue
		}
		row := rows[name]
		if row == nil {
			row = gin.H{"name": name}
			rows[name] = row
		}
		row[field] = s.Value
	}
}
