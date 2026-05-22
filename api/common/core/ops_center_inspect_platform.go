package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	networkmodel "kube-bt-sync/api/network/model"

	"github.com/gin-gonic/gin"
)

const kvKeyInspectNetworkDevices = "kubebt_network_devices_v1"

type inspectPrometheusScopeRow struct {
	Scope   string
	Label   string
	Enabled bool
}

func inspectPrometheusScopeRows(ai OpsAIInspectConfig) []inspectPrometheusScopeRow {
	return []inspectPrometheusScopeRow{
		{Scope: "k8s", Label: "Kubernetes", Enabled: ai.InspectPrometheusK8s},
		{Scope: "vcenter", Label: "vCenter", Enabled: ai.InspectPrometheusVCenter},
		{Scope: "pve", Label: "PVE", Enabled: ai.InspectPrometheusPVE},
		{Scope: "network", Label: "网络设备", Enabled: ai.InspectPrometheusNetwork},
	}
}

type inspectNetworkDevicesPayload struct {
	Devices []networkmodel.Device `json:"devices"`
}

func loadInspectNetworkDevices(kv PlatformKV) ([]networkmodel.Device, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyInspectNetworkDevices)
	if !ok || strings.TrimSpace(raw) == "" {
		return []networkmodel.Device{}, nil
	}
	var p inspectNetworkDevicesPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Devices == nil {
		return []networkmodel.Device{}, nil
	}
	sort.Slice(p.Devices, func(i, j int) bool {
		li := strings.ToLower(strings.TrimSpace(p.Devices[i].Kind + "/" + p.Devices[i].Name + "/" + p.Devices[i].ID))
		lj := strings.ToLower(strings.TrimSpace(p.Devices[j].Kind + "/" + p.Devices[j].Name + "/" + p.Devices[j].ID))
		return li < lj
	})
	return p.Devices, nil
}

func inspectNetworkKindCounts(devices []networkmodel.Device) map[string]int {
	out := map[string]int{}
	for _, dev := range devices {
		kind := strings.ToLower(strings.TrimSpace(dev.Kind))
		if kind == "" {
			kind = "unknown"
		}
		out[kind]++
	}
	return out
}

func inspectCollectPVESection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	sec := InspectionSection{ID: "pve", Title: "PVE / Proxmox VE"}
	if !ai.InspectPVE {
		sec.Status = "skip"
		sec.Markdown = "未在「巡检范围」中勾选 PVE / Proxmox VE。"
		return sec
	}
	var b strings.Builder
	if app == nil || app.PlatformKV() == nil {
		sec.Status = "warn"
		sec.Markdown = "Platform KV 不可用，无法读取 PVE 目标配置。"
		return sec
	}
	targets, err := pveTargetsForCompute(app)
	if err != nil {
		sec.Status = "warn"
		sec.Markdown = "读取 PVE 目标失败：" + inspectMdEscape(err.Error())
		return sec
	}
	if len(targets) == 0 {
		sec.Status = "warn"
		sec.Markdown = "已启用 PVE 巡检，但当前未配置 PVE / Proxmox VE 目标。"
		return sec
	}
	b.WriteString("### 目标配置\n\n")
	b.WriteString("| 名称 | 目标 ID | API 地址 | Prometheus job |\n| --- | --- | --- | --- |\n")
	for _, t := range targets {
		name := strings.TrimSpace(t.Name)
		if name == "" {
			name = "PVE"
		}
		b.WriteString(fmt.Sprintf("| %s | `%s` | `%s` | `%s` |\n",
			inspectMdEscape(name),
			inspectMdEscape(t.ID),
			inspectMdEscape(maskPrometheusURL(t.BaseURL)),
			inspectMdEscape(t.PrometheusJob),
		))
	}

	nodes, nodeWarnings := computePVEHosts(ctx, app)
	guests, guestWarnings := computePVEGuests(ctx, app)
	storage, storageWarnings := computePVEStorage(ctx, app)
	tasks, taskWarnings := computePVETasks(ctx, app)
	warned := false
	for _, warnings := range [][]string{nodeWarnings, guestWarnings, storageWarnings, taskWarnings} {
		if len(warnings) > 0 {
			warned = true
		}
	}
	b.WriteString("\n### 资源摘要\n\n")
	b.WriteString(fmt.Sprintf("- 节点：%d\n", len(nodes)))
	b.WriteString(fmt.Sprintf("- 虚拟机 / 容器：%d\n", len(guests)))
	b.WriteString(fmt.Sprintf("- 存储：%d\n", len(storage)))
	b.WriteString(fmt.Sprintf("- 近期任务：%d\n", len(tasks)))
	if len(tasks) > 0 {
		b.WriteString("\n### 近期任务样本\n\n")
		b.WriteString("| 节点 | 类型 | 状态 |\n| --- | --- | --- |\n")
		for _, task := range inspectLimitGinRows(tasks, 8) {
			b.WriteString(fmt.Sprintf("| %s | %s | %s |\n",
				inspectMdEscape(inspectGinString(task, "node")),
				inspectMdEscape(inspectGinString(task, "name")),
				inspectMdEscape(inspectGinString(task, "status")),
			))
		}
	}
	if warned {
		sec.Status = "warn"
		b.WriteString("\n### 采集告警\n\n")
		for _, warnings := range [][]string{nodeWarnings, guestWarnings, storageWarnings, taskWarnings} {
			for _, w := range warnings {
				b.WriteString("- " + inspectMdEscape(w) + "\n")
			}
		}
	}
	if ai.InspectPrometheusPVE {
		b.WriteString("\n### Prometheus（PVE 数据源）\n\n")
		if _, hint := PrometheusPromQLInstantProbe(cfg, "pve", "1"); hint != "" {
			sec.Status = "warn"
			b.WriteString("- 状态：警告，" + inspectMdEscape(hint) + "\n")
		} else {
			b.WriteString("- 状态：正常，即时查询可用。\n")
		}
	}
	if sec.Status == "" {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}

func inspectLimitGinRows(rows []gin.H, limit int) []gin.H {
	if limit <= 0 || len(rows) <= limit {
		return rows
	}
	return rows[:limit]
}

func inspectGinString(row gin.H, keys ...string) string {
	for _, key := range keys {
		v, ok := row[key]
		if !ok || v == nil {
			continue
		}
		if s := strings.TrimSpace(fmt.Sprint(v)); s != "" {
			return s
		}
	}
	return "-"
}

func inspectCollectNetworkSection(ctx context.Context, app *ServerApp, cfg Config, ai OpsAIInspectConfig) InspectionSection {
	_ = ctx
	sec := InspectionSection{ID: "network", Title: "网络设备（OpenWrt / iKuai）"}
	if !ai.InspectNetwork {
		sec.Status = "skip"
		sec.Markdown = "未在「巡检范围」中勾选网络设备（OpenWrt / iKuai）。"
		return sec
	}
	if app == nil || app.PlatformKV() == nil {
		sec.Status = "warn"
		sec.Markdown = "Platform KV 不可用，无法读取网络设备清单。"
		return sec
	}
	devices, err := loadInspectNetworkDevices(app.PlatformKV())
	if err != nil {
		sec.Status = "warn"
		sec.Markdown = "读取网络设备清单失败：" + inspectMdEscape(err.Error())
		return sec
	}
	var b strings.Builder
	counts := inspectNetworkKindCounts(devices)
	b.WriteString("### 设备摘要\n\n")
	b.WriteString(fmt.Sprintf("- OpenWrt：%d\n", counts["openwrt"]))
	b.WriteString(fmt.Sprintf("- iKuai：%d\n", counts["ikuai"]))
	b.WriteString(fmt.Sprintf("- 合计：%d\n", len(devices)))
	if len(devices) == 0 {
		sec.Status = "warn"
		b.WriteString("\n已启用网络设备巡检，但当前未登记 OpenWrt / iKuai 设备。\n")
	} else {
		b.WriteString("\n### 设备清单\n\n")
		b.WriteString("| 名称 | 类型 | 地址 | Prometheus scope | instance/job |\n| --- | --- | --- | --- | --- |\n")
		for _, dev := range devices {
			b.WriteString(fmt.Sprintf("| %s | %s | `%s` | `%s` | `%s` |\n",
				inspectMdEscape(inspectNetworkDeviceName(dev)),
				inspectMdEscape(strings.ToLower(strings.TrimSpace(dev.Kind))),
				inspectMdEscape(inspectNetworkDeviceAddress(dev)),
				inspectMdEscape(inspectNetworkDevicePrometheusScope(dev)),
				inspectMdEscape(inspectNetworkDeviceLabels(dev)),
			))
		}
	}
	if ai.InspectPrometheusNetwork {
		rows, warned := inspectNetworkPrometheusRows(cfg, devices)
		if warned {
			sec.Status = "warn"
		}
		b.WriteString("\n### Prometheus（网络设备数据源）\n\n")
		b.WriteString("| 对象 | scope | 状态 | 说明 |\n| --- | --- | --- | --- |\n")
		for _, row := range rows {
			b.WriteString(fmt.Sprintf("| %s | `%s` | %s | %s |\n",
				inspectMdEscape(row.Target),
				inspectMdEscape(row.Scope),
				inspectMdEscape(row.Status),
				inspectMdEscape(row.Detail),
			))
		}
	}
	if sec.Status == "" {
		sec.Status = "ok"
	}
	sec.Markdown = b.String()
	return sec
}

type inspectNetworkPrometheusRow struct {
	Target string
	Scope  string
	Status string
	Detail string
}

func inspectNetworkPrometheusRows(cfg Config, devices []networkmodel.Device) ([]inspectNetworkPrometheusRow, bool) {
	rows := []inspectNetworkPrometheusRow{}
	warned := false
	if _, hint := PrometheusPromQLInstantProbe(cfg, "network", "1"); hint != "" {
		rows = append(rows, inspectNetworkPrometheusRow{Target: "network", Scope: "network", Status: "警告", Detail: hint})
		warned = true
	} else {
		rows = append(rows, inspectNetworkPrometheusRow{Target: "network", Scope: "network", Status: "正常", Detail: "即时查询可用"})
	}
	for _, dev := range devices {
		kind := strings.ToLower(strings.TrimSpace(dev.Kind))
		switch kind {
		case "openwrt":
			families := inspectProbeOpenWrtMetricFamilies(cfg, dev)
			missing := families.MissingHints()
			detail := "exporter 指标族完整"
			status := "正常"
			if len(missing) > 0 {
				status = "警告"
				detail = strings.Join(missing, "；")
				warned = true
			}
			rows = append(rows, inspectNetworkPrometheusRow{
				Target: inspectNetworkDeviceName(dev),
				Scope:  inspectNetworkDevicePrometheusScope(dev),
				Status: status,
				Detail: detail,
			})
		case "ikuai":
			ok := inspectProbeIkuaiTrafficMetrics(cfg, dev)
			status := "正常"
			detail := "已发现 iKuai 流量指标"
			if !ok {
				status = "警告"
				detail = "未发现 ikuai_network_* 或 ikuai_client_* 流量指标"
				warned = true
			}
			rows = append(rows, inspectNetworkPrometheusRow{
				Target: inspectNetworkDeviceName(dev),
				Scope:  inspectNetworkDevicePrometheusScope(dev),
				Status: status,
				Detail: detail,
			})
		}
	}
	if len(devices) == 0 {
		rows = append(rows, inspectNetworkPrometheusRow{Target: "网络设备清单", Scope: "network", Status: "警告", Detail: "未登记 OpenWrt / iKuai 设备"})
		warned = true
	}
	return rows, warned
}

func inspectProbeOpenWrtMetricFamilies(cfg Config, dev networkmodel.Device) networkmodel.OpenWrtMetricFamilies {
	scope := inspectNetworkDevicePrometheusScope(dev)
	return networkmodel.OpenWrtMetricFamilies{
		System: inspectPromQLAny(cfg, scope,
			inspectNetworkMetricSelector("node_load1", dev),
			inspectNetworkMetricSelector("node_memory_MemAvailable_bytes", dev),
		),
		Interfaces: inspectPromQLAny(cfg, scope,
			inspectNetworkMetricSelector("node_network_receive_bytes_total", dev),
			inspectNetworkMetricSelector("node_network_up", dev),
		),
		DHCP: inspectPromQLAny(cfg, scope,
			inspectNetworkMetricSelector("node_dhcp_leases", dev),
			inspectNetworkMetricSelector("node_arp_entries", dev),
		),
		WiFi: inspectPromQLAny(cfg, scope,
			inspectNetworkMetricSelector("node_wifi_station_count", dev),
			inspectNetworkMetricSelector("node_wireless_station_signal_dbm", dev),
		),
		Netstat: inspectPromQLAny(cfg, scope,
			inspectNetworkMetricSelector("node_netstat_Tcp_CurrEstab", dev),
			inspectNetworkMetricSelector("node_nf_conntrack_entries", dev),
		),
	}
}

func inspectProbeIkuaiTrafficMetrics(cfg Config, dev networkmodel.Device) bool {
	scope := inspectNetworkDevicePrometheusScope(dev)
	return inspectPromQLAny(cfg, scope,
		inspectNetworkMetricSelector("ikuai_network_recv_kbytes_per_second", dev, `id=~"iface/.*|host|device/.*"`),
		inspectNetworkMetricSelector("ikuai_network_send_kbytes_per_second", dev, `id=~"iface/.*|host|device/.*"`),
		inspectNetworkMetricSelector("ikuai_client_download", dev),
		inspectNetworkMetricSelector("ikuai_client_upload", dev),
	)
}

func inspectPromQLAny(cfg Config, scope string, queries ...string) bool {
	for _, q := range queries {
		if _, hint := PrometheusPromQLInstantProbe(cfg, scope, q); hint == "" {
			return true
		}
	}
	return false
}

func inspectNetworkMetricSelector(metric string, dev networkmodel.Device, extra ...string) string {
	matchers := []string{}
	if s := strings.TrimSpace(dev.InstanceLabel); s != "" {
		matchers = append(matchers, `instance="`+inspectPrometheusLabelEscape(s)+`"`)
	}
	if s := strings.TrimSpace(dev.JobLabel); s != "" {
		matchers = append(matchers, `job="`+inspectPrometheusLabelEscape(s)+`"`)
	}
	for _, raw := range extra {
		if s := strings.TrimSpace(raw); s != "" {
			matchers = append(matchers, s)
		}
	}
	if len(matchers) == 0 {
		return metric
	}
	return metric + "{" + strings.Join(matchers, ",") + "}"
}

func inspectPrometheusLabelEscape(s string) string {
	s = strings.ReplaceAll(s, `\`, `\\`)
	return strings.ReplaceAll(s, `"`, `\"`)
}

func inspectNetworkDevicePrometheusScope(dev networkmodel.Device) string {
	scope := strings.ToLower(strings.TrimSpace(dev.PrometheusScope))
	switch scope {
	case "network", "vcenter", "default":
		return scope
	default:
		return "network"
	}
}

func inspectNetworkDeviceName(dev networkmodel.Device) string {
	if s := strings.TrimSpace(dev.Name); s != "" {
		return s
	}
	if s := strings.TrimSpace(dev.ID); s != "" {
		return s
	}
	return strings.ToLower(strings.TrimSpace(dev.Kind))
}

func inspectNetworkDeviceAddress(dev networkmodel.Device) string {
	if s := strings.TrimSpace(dev.APIURL); s != "" {
		return s
	}
	if s := strings.TrimSpace(dev.Host); s != "" {
		if dev.Port > 0 {
			return fmt.Sprintf("%s:%d", s, dev.Port)
		}
		return s
	}
	return "-"
}

func inspectNetworkDeviceLabels(dev networkmodel.Device) string {
	parts := []string{}
	if s := strings.TrimSpace(dev.InstanceLabel); s != "" {
		parts = append(parts, "instance="+s)
	}
	if s := strings.TrimSpace(dev.JobLabel); s != "" {
		parts = append(parts, "job="+s)
	}
	if len(parts) == 0 {
		return "-"
	}
	return strings.Join(parts, " / ")
}
