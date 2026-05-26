package service

import (
	"net/http"
	"sort"
	"strings"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"

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

func handleOpenWrtProbe(c *gin.Context, app *ServerApp) {
	var body networkDeviceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dev := openWrtDeviceFromProbeBody(body)
	if strings.TrimSpace(dev.Host) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OpenWrt 目标必须填写 host 或 apiUrl"})
		return
	}
	if dev.AuthType == openWrtAuthTypeSSHPassword && strings.TrimSpace(dev.Password) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OpenWrt SSH 密码不能为空"})
		return
	}
	if dev.AuthType == openWrtAuthTypeSSHPrivateKey && strings.TrimSpace(dev.PrivateKey) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "OpenWrt SSH 私钥不能为空"})
		return
	}
	probe, err := newOpenWrtClient(nil).Probe(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"probe": probe, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"probe": probe})
}

func openWrtDeviceFromProbeBody(body networkDeviceBody) networkmodel.Device {
	auth, _ := normalizeOpenWrtAuthType(body.AuthType)
	dev := networkmodel.Device{
		Kind:          networkDeviceKindOpenWrt,
		Name:          strings.TrimSpace(body.Name),
		APIURL:        strings.TrimSpace(body.APIURL),
		Host:          strings.TrimSpace(body.Host),
		Port:          body.Port,
		AuthType:      auth,
		Username:      strings.TrimSpace(body.Username),
		Password:      body.Password,
		PrivateKey:    body.PrivateKey,
		SkipTLSVerify: body.SkipTLSVerify,
	}
	return normalizeNetworkDeviceInput(dev)
}

func handleOpenWrtOverview(c *gin.Context, app *ServerApp) {
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	out, err := newOpenWrtClient(nil).Overview(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
		return
	}
	out["device"] = networkDeviceListItem(dev)
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtInterfaces(c *gin.Context, app *ServerApp) {
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	out, err := newOpenWrtClient(nil).Interfaces(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
		return
	}
	out["device"] = networkDeviceListItem(dev)
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtClients(c *gin.Context, app *ServerApp) {
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	out, err := newOpenWrtClient(nil).Clients(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
		return
	}
	out["device"] = networkDeviceListItem(dev)
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtWireless(c *gin.Context, app *ServerApp) {
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	out, err := newOpenWrtClient(nil).Wireless(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
		return
	}
	out["device"] = networkDeviceListItem(dev)
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtFirewall(c *gin.Context, app *ServerApp) {
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	out, err := newOpenWrtClient(nil).Firewall(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "device": networkDeviceListItem(dev)})
		return
	}
	out["device"] = networkDeviceListItem(dev)
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtAction(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	var body openWrtActionRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if strings.EqualFold(strings.TrimSpace(body.Action), "reboot") && !body.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "重启 OpenWrt 必须显式 confirm=true"})
		return
	}
	out, err := newOpenWrtClient(nil).RunAction(c.Request.Context(), dev, body.Action)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error(), "result": out})
		return
	}
	c.JSON(http.StatusOK, out)
}

func handleOpenWrtConfigDryRun(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	if _, ok := openWrtDeviceForRequest(c, app); !ok {
		return
	}
	var body openWrtConfigRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	preview, err := buildOpenWrtConfigCommands(body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, preview)
}

func handleOpenWrtConfigApply(c *gin.Context, app *ServerApp) {
	if !requireNetworkAdmin(c) {
		return
	}
	dev, ok := openWrtDeviceForRequest(c, app)
	if !ok {
		return
	}
	var body openWrtConfigRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	out, err := newOpenWrtClient(nil).ApplyConfig(c.Request.Context(), dev, body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "result": out})
		return
	}
	c.JSON(http.StatusOK, out)
}

func openWrtDeviceForRequest(c *gin.Context, app *ServerApp) (networkmodel.Device, bool) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return networkmodel.Device{}, false
	}
	if dev.Kind != networkDeviceKindOpenWrt {
		c.JSON(http.StatusBadRequest, gin.H{"error": "该网络设备不是 OpenWrt 目标"})
		return networkmodel.Device{}, false
	}
	dev, err := decryptNetworkDeviceSecrets(app, dev)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无法解密 OpenWrt 凭据: " + err.Error()})
		return networkmodel.Device{}, false
	}
	return dev, true
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
			"device":               networkDeviceListItem(dev),
			"source":               "prometheus",
			"checkedAt":            NowShanghaiRFC3339(),
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
		"device":               networkDeviceListItem(dev),
		"source":               "prometheus",
		"checkedAt":            NowShanghaiRFC3339(),
	})
}

func handleNetworkDeviceInterfaces(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind == networkDeviceKindOpenWrt {
		handleOpenWrtInterfaces(c, app)
		return
	}
	c.JSON(http.StatusOK, gin.H{"device": networkDeviceListItem(dev), "interfaces": []gin.H{}, "note": "iKuai 接口图表由 iKuai 监控页展示"})
}

func handleNetworkDeviceClients(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind == networkDeviceKindOpenWrt {
		handleOpenWrtClients(c, app)
		return
	}
	c.JSON(http.StatusOK, gin.H{"device": networkDeviceListItem(dev), "clients": []gin.H{}, "note": "iKuai 客户端由 iKuai 监控页展示"})
}

func handleNetworkDeviceTraffic(c *gin.Context, app *ServerApp) {
	dev, ok := networkDeviceByID(c, app)
	if !ok {
		return
	}
	if dev.Kind != networkDeviceKindOpenWrt {
		c.JSON(http.StatusOK, gin.H{"device": networkDeviceListItem(dev), "traffic": []gin.H{}, "note": "iKuai 协议流量由 iKuai 监控页展示"})
		return
	}
	base := prometheusBaseForNetworkScope(app.Cfg(), dev.PrometheusScope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "device": networkDeviceListItem(dev), "traffic": []gin.H{}, "missingHints": OpenWrtMetricFamilies{}.MissingHints()})
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
	c.JSON(http.StatusOK, gin.H{"prometheusConfigured": true, "device": networkDeviceListItem(dev), "traffic": out, "source": "prometheus"})
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

func handleOpenWrtPrometheusInterfaces(c *gin.Context, app *ServerApp, dev networkmodel.Device) {
	base := prometheusBaseForNetworkScope(app.Cfg(), dev.PrometheusScope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{"prometheusConfigured": false, "device": networkDeviceListItem(dev), "interfaces": []gin.H{}, "missingHints": OpenWrtMetricFamilies{}.MissingHints()})
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
	c.JSON(http.StatusOK, gin.H{"prometheusConfigured": true, "device": networkDeviceListItem(dev), "interfaces": out, "source": "prometheus"})
}
