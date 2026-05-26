package service

import (
	"net/http"
	"sort"
	"strings"

	networkmodel "github.com/ops-easy/EasyPanel/api/api/network/model"

	"github.com/gin-gonic/gin"
)

const ikuaiModernRecvJoin = `(ikuai_network_recv_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`
const ikuaiModernSendJoin = `(ikuai_network_send_kbytes_per_second{id=~"device/.*"}) * on(instance,job,id) group_left(ip_addr,mac,hostname,comment) (ikuai_device_info)`

var ikuaiModernDownloadByIPQueries = []string{
	`max by (ip_addr) (` + ikuaiModernRecvJoin + `)`,
}

var ikuaiModernUploadByIPQueries = []string{
	`max by (ip_addr) (` + ikuaiModernSendJoin + `)`,
}

var ikuaiModernTopologyQueries = []string{
	`topk(500, ` + ikuaiModernRecvJoin + `)`,
	ikuaiModernRecvJoin,
}

var ikuaiClientDownloadByIPQueries = []string{
	`max by (ip_addr) (ikuai_client_download)`,
}

var ikuaiClientUploadByIPQueries = []string{
	`max by (ip_addr) (ikuai_client_upload)`,
}

var ikuaiClientStreamDetailQueries = []string{
	`topk(500, ikuai_client_download)`,
	`ikuai_client_download`,
}

func ikuaiStreamPerfRowFromRaw(downloadRaw, uploadRaw float64, unit string) gin.H {
	u := strings.ToLower(strings.TrimSpace(unit))
	if u == "kbs" || u == "kb_s" || u == "kilobytes" {
		return gin.H{
			"netRx": downloadRaw, "netTx": uploadRaw,
			"netRxUnit": "kiloBytesPerSecond", "netTxUnit": "kiloBytesPerSecond",
		}
	}
	return gin.H{
		"netRx": downloadRaw / 1024, "netTx": uploadRaw / 1024,
		"netRxUnit": "kiloBytesPerSecond", "netTxUnit": "kiloBytesPerSecond",
	}
}

func firstNonEmptyVectorByLabelKeyNetwork(base string, queries []string, labelKey string) (map[string]float64, string, error) {
	var lastErr error
	for _, q := range queries {
		samples, err := promQueryInstant(base, q)
		if err != nil {
			lastErr = err
			continue
		}
		out := map[string]float64{}
		for _, s := range samples {
			k := strings.TrimSpace(s.Metric[labelKey])
			if k == "" {
				continue
			}
			out[k] = s.Value
		}
		if len(out) > 0 {
			return out, q, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return map[string]float64{}, "", nil
}

func firstNonEmptyIkuaiSamples(base string, queries []string) ([]promSample, string, error) {
	var lastErr error
	for _, q := range queries {
		samples, err := promQueryInstant(base, q)
		if err != nil {
			lastErr = err
			continue
		}
		if len(samples) > 0 {
			return samples, q, nil
		}
	}
	if lastErr != nil {
		return nil, "", lastErr
	}
	return []promSample{}, "", nil
}

func safeNetworkFloatMap(m map[string]float64) map[string]float64 {
	if m == nil {
		return map[string]float64{}
	}
	return m
}

func handleNetworkIkuaiClientStream(c *gin.Context, app *ServerApp) {
	unit := strings.ToLower(strings.TrimSpace(c.DefaultQuery("unit", "bytes")))
	scope := strings.TrimSpace(c.DefaultQuery("scope", "vcenter"))
	base := prometheusBaseForNetworkScope(app.Cfg(), scope)
	if strings.TrimSpace(base) == "" {
		c.JSON(http.StatusOK, gin.H{
			"prometheusConfigured": false,
			"ratesByIp":            gin.H{},
			"devices":              []gin.H{},
			"note":                 "未配置 Prometheus（network/vcenter/default scope 均为空）",
			"checkedAt":            NowShanghaiRFC3339(),
		})
		return
	}

	var dl, ul map[string]float64
	var qDl, qUl string
	var errDl, errUl error
	useModern := false

	mdl, mqDl, errM := firstNonEmptyVectorByLabelKeyNetwork(base, ikuaiModernDownloadByIPQueries, "ip_addr")
	if errM == nil && len(mdl) > 0 {
		useModern = true
		dl = mdl
		qDl = mqDl
		mul, mqUl, errMU := firstNonEmptyVectorByLabelKeyNetwork(base, ikuaiModernUploadByIPQueries, "ip_addr")
		if errMU != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "Prometheus 查询 iKuai 上行（Go exporter）失败: " + errMU.Error(),
			})
			return
		}
		ul = mul
		qUl = mqUl
	} else {
		dl, qDl, errDl = firstNonEmptyVectorByLabelKeyNetwork(base, ikuaiClientDownloadByIPQueries, "ip_addr")
		ul, qUl, errUl = firstNonEmptyVectorByLabelKeyNetwork(base, ikuaiClientUploadByIPQueries, "ip_addr")
		if errDl != nil && errUl != nil {
			msg := errDl.Error()
			if errUl != nil {
				msg += "; " + errUl.Error()
			}
			c.JSON(http.StatusBadGateway, gin.H{
				"error": "Prometheus 查询 iKuai 终端流量失败（需要 Go 版 ikuai_* 或 Python 版 ikuai_client_* 指标）: " + msg,
			})
			return
		}
	}
	dl = safeNetworkFloatMap(dl)
	ul = safeNetworkFloatMap(ul)

	allIP := map[string]struct{}{}
	for ip := range dl {
		allIP[ip] = struct{}{}
	}
	for ip := range ul {
		allIP[ip] = struct{}{}
	}
	rateUnit := unit
	if useModern {
		rateUnit = "kbs"
	}
	ratesByIP := gin.H{}
	for ip := range allIP {
		ratesByIP[ip] = ikuaiStreamPerfRowFromRaw(dl[ip], ul[ip], rateUnit)
	}

	devices := []gin.H{}
	var qDet string
	if useModern {
		samples, qd, errDet := firstNonEmptyIkuaiSamples(base, ikuaiModernTopologyQueries)
		qDet = qd
		if errDet == nil {
			devices = ikuaiSamplesToDevices(samples, ul, false)
		}
	} else {
		samples, qd, errDet := firstNonEmptyIkuaiSamples(base, ikuaiClientStreamDetailQueries)
		qDet = qd
		if errDet == nil {
			devices = ikuaiSamplesToDevices(samples, ul, true)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"prometheusConfigured": true,
		"ratesByIp":            ratesByIP,
		"devices":              devices,
		"exporterKind":         map[bool]string{true: "modern", false: "legacy"}[useModern],
		"note":                 "来自 Prometheus：优先匹配 Go 版 ikuai_exporter，未命中时回退 Python 版 ikuai_client_*。",
		"queriesUsed":          gin.H{"downloadByIp": qDl, "uploadByIp": qUl, "topology": qDet},
		"checkedAt":            NowShanghaiRFC3339(),
	})
}

func ikuaiSamplesToDevices(samples []promSample, uploadByIP map[string]float64, legacy bool) []gin.H {
	dedup := make(map[string]gin.H)
	for _, s := range samples {
		ip := strings.TrimSpace(s.Metric["ip_addr"])
		if ip == "" {
			continue
		}
		if prev, ok := dedup[ip]; ok {
			if prevDownload, ok := prev["download"].(float64); ok && s.Value <= prevDownload {
				continue
			}
		}
		row := gin.H{
			"ip":       ip,
			"mac":      strings.TrimSpace(s.Metric["mac"]),
			"hostname": strings.TrimSpace(s.Metric["hostname"]),
			"comment":  strings.TrimSpace(s.Metric["comment"]),
			"download": s.Value,
			"upload":   uploadByIP[ip],
		}
		if legacy {
			row["clientType"] = strings.TrimSpace(s.Metric["client_type"])
		} else {
			row["clientType"] = ""
		}
		dedup[ip] = row
	}
	devices := make([]gin.H, 0, len(dedup))
	for _, row := range dedup {
		devices = append(devices, row)
	}
	sort.Slice(devices, func(i, j int) bool {
		di, _ := devices[i]["download"].(float64)
		dj, _ := devices[j]["download"].(float64)
		return di > dj
	})
	return devices
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
