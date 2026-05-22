package core

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	pvemodel "kube-bt-sync/api/pve/model"
	pveprovider "kube-bt-sync/api/pve/provider"
	sharedcrypto "kube-bt-sync/common/crypto"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/find"
	"github.com/vmware/govmomi/vim25/mo"
)

const computeVCenterTargetID = "default"

type computeProviderRow struct {
	Provider   string         `json:"provider"`
	TargetID   string         `json:"targetId"`
	Name       string         `json:"name"`
	Configured bool           `json:"configured"`
	Healthy    bool           `json:"healthy,omitempty"`
	Hint       string         `json:"hint,omitempty"`
	BaseURL    string         `json:"baseUrl,omitempty"`
	Source     map[string]any `json:"source,omitempty"`
}

type computeStatusPresentation struct {
	Label   string
	Health  string
	Running bool
}

func pveTargetsForCompute(app *ServerApp) ([]pvemodel.Target, error) {
	list, err := pveprovider.LoadTargets(app.PlatformKV())
	if err != nil {
		return nil, err
	}
	for _, target := range list {
		if strings.TrimSpace(target.ID) != "" {
			return []pvemodel.Target{target}, nil
		}
	}
	return []pvemodel.Target{}, nil
}

func computeProviderRows(app *ServerApp) ([]computeProviderRow, error) {
	cfg := app.Cfg()
	rows := []computeProviderRow{
		{
			Provider:   "vcenter",
			TargetID:   computeVCenterTargetID,
			Name:       "vCenter",
			Configured: cfg.vCenterConfigured(),
			Hint:       maskVCenterURL(cfg.VCenterURL),
		},
	}
	pveTargets, err := pveTargetsForCompute(app)
	if err != nil {
		return rows, err
	}
	if len(pveTargets) == 0 {
		rows = append(rows, computeProviderRow{Provider: "pve", TargetID: "", Name: "PVE", Configured: false})
		return rows, nil
	}
	target := pveTargets[0]
	rows = append(rows, computeProviderRow{
		Provider:   "pve",
		TargetID:   target.ID,
		Name:       target.Name,
		BaseURL:    target.BaseURL,
		Configured: true,
	})
	return rows, nil
}

func computePVEClient(app *ServerApp, target pvemodel.Target) (*pveprovider.Client, error) {
	key, err := sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
	if err != nil {
		return nil, err
	}
	plain, err := pveprovider.DecryptTargetCredential(key, target)
	if err != nil {
		return nil, err
	}
	return pveprovider.NewClient(target, plain)
}

func computeDataArray(raw json.RawMessage) []map[string]any {
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err == nil && arr != nil {
		return arr
	}
	var wrapper struct {
		Data []map[string]any `json:"data"`
	}
	if err := json.Unmarshal(raw, &wrapper); err == nil && wrapper.Data != nil {
		return wrapper.Data
	}
	return []map[string]any{}
}

func computeString(row map[string]any, keys ...string) string {
	for _, key := range keys {
		if v, ok := row[key]; ok && v != nil {
			s := strings.TrimSpace(strings.Trim(strings.TrimSpace(jsonScalarString(v)), `"`))
			if s != "" && s != "<nil>" {
				return s
			}
		}
	}
	return ""
}

func jsonScalarString(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		b, _ := json.Marshal(x)
		return string(b)
	case bool:
		if x {
			return "true"
		}
		return "false"
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}

func computeStatusInfo(status string) computeStatusPresentation {
	raw := strings.TrimSpace(status)
	normalized := strings.NewReplacer(" ", "", "-", "", "_", "").Replace(strings.ToLower(raw))
	if normalized == "" {
		return computeStatusPresentation{Label: "未知", Health: "unknown"}
	}
	switch normalized {
	case "poweredon", "running":
		return computeStatusPresentation{Label: "运行中", Health: "ok", Running: true}
	case "online", "connected":
		return computeStatusPresentation{Label: "在线", Health: "ok", Running: true}
	case "ok", "success", "available", "normal", "green":
		return computeStatusPresentation{Label: "正常", Health: "ok", Running: true}
	case "poweredoff", "stopped", "shutdown", "disabled":
		return computeStatusPresentation{Label: "已停止", Health: "idle"}
	case "suspended", "standby":
		return computeStatusPresentation{Label: "已挂起", Health: "warning"}
	case "maintenance", "maintenancemode", "inmaintenance":
		return computeStatusPresentation{Label: "维护中", Health: "warning"}
	case "notresponding":
		return computeStatusPresentation{Label: "无响应", Health: "critical"}
	case "disconnected", "offline":
		return computeStatusPresentation{Label: "离线", Health: "critical"}
	}
	if strings.Contains(normalized, "failed") || strings.Contains(normalized, "error") || strings.Contains(normalized, "critical") {
		return computeStatusPresentation{Label: "异常", Health: "critical"}
	}
	if strings.Contains(normalized, "warn") || strings.Contains(normalized, "yellow") {
		return computeStatusPresentation{Label: "告警", Health: "warning"}
	}
	return computeStatusPresentation{Label: raw, Health: "unknown"}
}

func computeFloat(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case float32:
		return float64(x), true
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case int32:
		return float64(x), true
	case json.Number:
		n, err := x.Float64()
		return n, err == nil
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(x), 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func computeNumberFrom(row gin.H, source map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		if v, ok := row[key]; ok {
			if n, yes := computeFloat(v); yes {
				return n, true
			}
		}
		if v, ok := source[key]; ok {
			if n, yes := computeFloat(v); yes {
				return n, true
			}
		}
	}
	return 0, false
}

func computePctValue(v float64) float64 {
	if v >= 0 && v <= 1 {
		return v * 100
	}
	return v
}

func computePctFromParts(used, total float64) (float64, bool) {
	if total <= 0 {
		return 0, false
	}
	return used / total * 100, true
}

func computeRowSource(row gin.H) map[string]any {
	if src, ok := row["source"].(map[string]any); ok && src != nil {
		return src
	}
	return map[string]any{}
}

func computeActions(row gin.H) []string {
	if actions, ok := row["actions"].([]string); ok {
		return actions
	}
	if caps, ok := row["capabilities"].([]string); ok {
		return append([]string(nil), caps...)
	}
	if caps, ok := row["capabilities"].([]any); ok {
		out := make([]string, 0, len(caps))
		for _, cap := range caps {
			if s := strings.TrimSpace(jsonScalarString(cap)); s != "" {
				out = append(out, s)
			}
		}
		return out
	}
	return []string{}
}

func computeUsage(row gin.H) gin.H {
	src := computeRowSource(row)
	usage := gin.H{}
	if cpu, ok := computeNumberFrom(row, src, "cpuPct", "cpuUsagePercent", "cpu"); ok {
		usage["cpuPct"] = computePctValue(cpu)
	}
	if memPct, ok := computeNumberFrom(row, src, "memoryPct", "memoryUsagePercent"); ok {
		usage["memoryPct"] = computePctValue(memPct)
	} else if used, hasUsed := computeNumberFrom(row, src, "memoryUsedBytes", "mem", "memoryUsed"); hasUsed {
		if total, hasTotal := computeNumberFrom(row, src, "memoryTotalBytes", "maxmem", "memoryTotal"); hasTotal {
			if pct, ok := computePctFromParts(used, total); ok {
				usage["memoryPct"] = pct
				usage["memoryUsedBytes"] = used
				usage["memoryTotalBytes"] = total
			}
		}
	}
	if diskPct, ok := computeNumberFrom(row, src, "diskPct", "diskUsagePercent"); ok {
		usage["diskPct"] = computePctValue(diskPct)
	} else if used, hasUsed := computeNumberFrom(row, src, "diskUsedBytes", "disk", "committedBytes"); hasUsed {
		if total, hasTotal := computeNumberFrom(row, src, "diskTotalBytes", "maxdisk", "capacityBytes"); hasTotal {
			if pct, ok := computePctFromParts(used, total); ok {
				usage["diskPct"] = pct
				usage["diskUsedBytes"] = used
				usage["diskTotalBytes"] = total
			}
		}
	} else if capacity, hasCapacity := computeNumberFrom(row, src, "capacityBytes"); hasCapacity {
		if free, hasFree := computeNumberFrom(row, src, "freeBytes"); hasFree {
			used := capacity - free
			if pct, ok := computePctFromParts(used, capacity); ok {
				usage["diskPct"] = pct
				usage["diskUsedBytes"] = used
				usage["diskTotalBytes"] = capacity
			}
		}
	}
	return usage
}

func computeEnrichRow(row gin.H, kind string) {
	row["kind"] = kind
	status := computeString(map[string]any(row), "status")
	info := computeStatusInfo(status)
	row["statusLabel"] = info.Label
	row["health"] = info.Health
	row["running"] = info.Running
	row["actions"] = computeActions(row)
	if usage := computeUsage(row); len(usage) > 0 {
		row["usage"] = usage
	}
}

func computeEnrichRows(rows []gin.H, kind string) []gin.H {
	for _, row := range rows {
		computeEnrichRow(row, kind)
	}
	return rows
}

func computeBuildSummary(rowsByKind map[string][]gin.H, warnings []string) gin.H {
	counts := gin.H{}
	health := gin.H{"ok": 0, "idle": 0, "warning": 0, "critical": 0, "unknown": 0}
	providers := gin.H{}
	hotspots := make([]gin.H, 0)
	recentFailures := make([]gin.H, 0)
	for _, key := range []string{"guests", "hosts", "storage", "activity"} {
		rows := rowsByKind[key]
		counts[key] = len(rows)
		for _, row := range rows {
			h := computeString(map[string]any(row), "health")
			if h == "" {
				h = "unknown"
			}
			if _, ok := health[h]; !ok {
				health[h] = 0
			}
			health[h] = health[h].(int) + 1
			provider := computeString(map[string]any(row), "provider")
			if provider != "" {
				current, _ := providers[provider].(int)
				providers[provider] = current + 1
			}
			if h == "critical" || h == "warning" {
				item := gin.H{
					"kind":       key,
					"provider":   row["provider"],
					"resourceId": row["resourceId"],
					"name":       row["name"],
					"health":     h,
					"status":     row["status"],
				}
				if key == "activity" {
					recentFailures = append(recentFailures, item)
				} else {
					hotspots = append(hotspots, item)
				}
			}
		}
	}
	counts["warnings"] = len(warnings)
	return gin.H{
		"counts":         counts,
		"health":         health,
		"providers":      providers,
		"hotspots":       hotspots,
		"recentFailures": recentFailures,
		"warnings":       warnings,
		"warningCount":   len(warnings),
	}
}

func computeVCenterGuests(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	if !app.Cfg().vCenterConfigured() {
		return []gin.H{}, nil
	}
	payload, _, _, err := vcenterVMListSnapshotBytes(ctx, app, false, false)
	if err != nil {
		return []gin.H{}, []string{"vCenter 虚拟机: " + err.Error()}
	}
	var envelope struct {
		VMs []map[string]any `json:"vms"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return []gin.H{}, []string{"vCenter 虚拟机 JSON: " + err.Error()}
	}
	out := make([]gin.H, 0, len(envelope.VMs))
	for _, row := range envelope.VMs {
		moref := computeString(row, "moref")
		out = append(out, gin.H{
			"provider":     "vcenter",
			"targetId":     computeVCenterTargetID,
			"resourceId":   moref,
			"name":         computeString(row, "name"),
			"status":       computeString(row, "powerState"),
			"ip":           computeString(row, "ip"),
			"guestType":    "vm",
			"capabilities": []string{"detail", "metrics", "power", "hardware", "diskExpand", "console", "ssh", "sftp", "snapshots"},
			"source":       row,
		})
	}
	return computeEnrichRows(out, "guest"), nil
}

func computeVCenterHosts(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	vc := app.VCenter()
	if !vc.cfg.vCenterConfigured() {
		return []gin.H{}, nil
	}
	rows := make([]gin.H, 0)
	err := vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
		rows = rows[:0]
		f := find.NewFinder(client.Client, true)
		dcs, err := f.DatacenterList(ctx, "*")
		if err != nil {
			return err
		}
		seen := map[string]struct{}{}
		for _, dc := range dcs {
			f.SetDatacenter(dc)
			hosts, err := f.HostSystemList(ctx, "*")
			if err != nil {
				continue
			}
			for _, hs := range hosts {
				ref := hs.Reference().Value
				if _, ok := seen[ref]; ok {
					continue
				}
				seen[ref] = struct{}{}
				var m mo.HostSystem
				if err := hs.Properties(ctx, hs.Reference(), []string{"name", "summary", "runtime"}, &m); err != nil {
					continue
				}
				src := hostRowFromMO(&m, ref)
				rows = append(rows, gin.H{
					"provider":     "vcenter",
					"targetId":     computeVCenterTargetID,
					"resourceId":   ref,
					"name":         m.Name,
					"status":       src["connectionState"],
					"capabilities": []string{"detail", "metrics"},
					"source":       src,
				})
			}
		}
		return nil
	})
	if err != nil {
		return []gin.H{}, []string{"vCenter 宿主机: " + err.Error()}
	}
	return computeEnrichRows(rows, "host"), nil
}

func computePVERows(ctx context.Context, app *ServerApp, path string, query url.Values, field string) ([]gin.H, []string) {
	targets, err := pveTargetsForCompute(app)
	if err != nil {
		return []gin.H{}, []string{"PVE 目标: " + err.Error()}
	}
	if len(targets) == 0 {
		return []gin.H{}, nil
	}
	target := targets[0]
	client, err := computePVEClient(app, target)
	if err != nil {
		return []gin.H{}, []string{"PVE 凭据: " + err.Error()}
	}
	raw, err := client.Do(ctx, http.MethodGet, path, query, nil)
	if err != nil {
		return []gin.H{}, []string{"PVE " + field + ": " + err.Error()}
	}
	rows := computeDataArray(raw)
	out := make([]gin.H, 0, len(rows))
	for _, row := range rows {
		out = append(out, gin.H{
			"provider": "pve",
			"targetId": target.ID,
			"source":   row,
		})
	}
	return out, nil
}

func computePVEGuests(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	q := url.Values{"type": []string{"vm"}}
	rows, warnings := computePVERows(ctx, app, "/cluster/resources", q, "虚拟机")
	for _, row := range rows {
		src := row["source"].(map[string]any)
		vmid := computeString(src, "vmid")
		row["resourceId"] = vmid
		row["name"] = computeString(src, "name", "id")
		row["status"] = computeString(src, "status")
		row["node"] = computeString(src, "node")
		row["guestType"] = computeString(src, "type")
		row["capabilities"] = []string{"detail", "metrics", "power", "hardware", "console", "ssh", "sftp", "snapshots"}
	}
	return computeEnrichRows(rows, "guest"), warnings
}

func computePVEHosts(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	rows, warnings := computePVERows(ctx, app, "/nodes", nil, "节点")
	for _, row := range rows {
		src := row["source"].(map[string]any)
		name := computeString(src, "node", "name")
		row["resourceId"] = name
		row["name"] = name
		row["status"] = computeString(src, "status")
		row["capabilities"] = []string{"detail", "metrics", "guests", "storage", "tasks"}
	}
	return computeEnrichRows(rows, "host"), warnings
}

func computePVEStorage(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	q := url.Values{"type": []string{"storage"}}
	rows, warnings := computePVERows(ctx, app, "/cluster/resources", q, "存储")
	for _, row := range rows {
		src := row["source"].(map[string]any)
		id := computeString(src, "id", "storage")
		row["resourceId"] = id
		row["name"] = computeString(src, "storage", "name", "id")
		row["node"] = computeString(src, "node")
		row["status"] = computeString(src, "status")
		row["capabilities"] = []string{"detail"}
	}
	return computeEnrichRows(rows, "storage"), warnings
}

func computePVETasks(ctx context.Context, app *ServerApp) ([]gin.H, []string) {
	rows, warnings := computePVERows(ctx, app, "/cluster/tasks", nil, "任务")
	for _, row := range rows {
		src := row["source"].(map[string]any)
		id := computeString(src, "upid", "id")
		row["resourceId"] = id
		row["name"] = computeString(src, "type", "upid")
		row["status"] = computeString(src, "exitstatus", "status")
		row["node"] = computeString(src, "node")
		row["capabilities"] = []string{"detail"}
	}
	return computeEnrichRows(rows, "activity"), warnings
}

func handleComputeProviders(c *gin.Context, app *ServerApp) {
	rows, err := computeProviderRows(app)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"providers": rows, "warnings": []string{err.Error()}})
		return
	}
	c.JSON(http.StatusOK, gin.H{"providers": rows})
}

func handleComputeGuests(c *gin.Context, app *ServerApp) {
	ctx := c.Request.Context()
	vcenterRows, vcWarnings := computeVCenterGuests(ctx, app)
	pveRows, pveWarnings := computePVEGuests(ctx, app)
	rows := append(vcenterRows, pveRows...)
	c.JSON(http.StatusOK, gin.H{"guests": rows, "warnings": append(vcWarnings, pveWarnings...)})
}

func handleComputeHosts(c *gin.Context, app *ServerApp) {
	ctx := c.Request.Context()
	vcenterRows, vcWarnings := computeVCenterHosts(ctx, app)
	pveRows, pveWarnings := computePVEHosts(ctx, app)
	rows := append(vcenterRows, pveRows...)
	c.JSON(http.StatusOK, gin.H{"hosts": rows, "warnings": append(vcWarnings, pveWarnings...)})
}

func handleComputeStorage(c *gin.Context, app *ServerApp) {
	rows := make([]gin.H, 0)
	warnings := []string{}
	if app.Cfg().vCenterConfigured() {
		if stores, err := vcenterDatastoreRows(c.Request.Context(), app.VCenter()); err != nil {
			warnings = append(warnings, "vCenter 存储: "+err.Error())
		} else {
			for _, src := range stores {
				rows = append(rows, gin.H{
					"provider":     "vcenter",
					"targetId":     computeVCenterTargetID,
					"resourceId":   src["moref"],
					"name":         src["name"],
					"status":       src["maintenanceMode"],
					"capabilities": []string{"detail"},
					"source":       src,
				})
			}
		}
	}
	rows = computeEnrichRows(rows, "storage")
	pveRows, pveWarnings := computePVEStorage(c.Request.Context(), app)
	rows = append(rows, pveRows...)
	warnings = append(warnings, pveWarnings...)
	c.JSON(http.StatusOK, gin.H{"storage": rows, "warnings": warnings})
}

func handleComputeActivity(c *gin.Context, app *ServerApp) {
	rows := make([]gin.H, 0)
	warnings := []string{}
	if app.Cfg().vCenterConfigured() {
		events, updatedAt := GetVCenterVMEvents(app.PlatformKV(), 200, 0)
		for _, event := range events {
			rows = append(rows, gin.H{
				"provider":   "vcenter",
				"targetId":   computeVCenterTargetID,
				"resourceId": event.Key,
				"name":       event.EventType,
				"status":     event.Message,
				"createdAt":  event.CreatedAt,
				"actions":    []string{"detail"},
				"source":     event,
			})
		}
		if updatedAt == "" && len(events) == 0 {
			warnings = append(warnings, "vCenter 事件缓存为空，后台采集后会显示")
		}
	}
	rows = computeEnrichRows(rows, "activity")
	pveRows, pveWarnings := computePVETasks(c.Request.Context(), app)
	rows = append(rows, pveRows...)
	warnings = append(warnings, pveWarnings...)
	c.JSON(http.StatusOK, gin.H{"activity": rows, "warnings": warnings})
}

func handleComputeSummary(c *gin.Context, app *ServerApp) {
	providers, err := computeProviderRows(app)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"providers": providers, "warnings": []string{err.Error()}})
		return
	}
	ctx := c.Request.Context()
	guestsVC, warnGuestsVC := computeVCenterGuests(ctx, app)
	guestsPVE, warnGuestsPVE := computePVEGuests(ctx, app)
	hostsVC, warnHostsVC := computeVCenterHosts(ctx, app)
	hostsPVE, warnHostsPVE := computePVEHosts(ctx, app)
	storageRows := make([]gin.H, 0)
	storageWarnings := []string{}
	if app.Cfg().vCenterConfigured() {
		if stores, err := vcenterDatastoreRows(ctx, app.VCenter()); err != nil {
			storageWarnings = append(storageWarnings, "vCenter 存储: "+err.Error())
		} else {
			for _, src := range stores {
				storageRows = append(storageRows, gin.H{
					"provider":     "vcenter",
					"targetId":     computeVCenterTargetID,
					"resourceId":   src["moref"],
					"name":         src["name"],
					"status":       src["maintenanceMode"],
					"capabilities": []string{"detail"},
					"source":       src,
				})
			}
		}
	}
	storageRows = computeEnrichRows(storageRows, "storage")
	storagePVE, warnStoragePVE := computePVEStorage(ctx, app)
	activityRows := make([]gin.H, 0)
	activityWarnings := []string{}
	if app.Cfg().vCenterConfigured() {
		events, updatedAt := GetVCenterVMEvents(app.PlatformKV(), 200, 0)
		for _, event := range events {
			activityRows = append(activityRows, gin.H{
				"provider":   "vcenter",
				"targetId":   computeVCenterTargetID,
				"resourceId": event.Key,
				"name":       event.EventType,
				"status":     event.Message,
				"createdAt":  event.CreatedAt,
				"actions":    []string{"detail"},
				"source":     event,
			})
		}
		if updatedAt == "" && len(events) == 0 {
			activityWarnings = append(activityWarnings, "vCenter 事件缓存为空，后台采集后会显示")
		}
	}
	activityRows = computeEnrichRows(activityRows, "activity")
	activityPVE, warnActivityPVE := computePVETasks(ctx, app)
	warnings := append([]string{}, warnGuestsVC...)
	warnings = append(warnings, warnGuestsPVE...)
	warnings = append(warnings, warnHostsVC...)
	warnings = append(warnings, warnHostsPVE...)
	warnings = append(warnings, storageWarnings...)
	warnings = append(warnings, warnStoragePVE...)
	warnings = append(warnings, activityWarnings...)
	warnings = append(warnings, warnActivityPVE...)
	summary := computeBuildSummary(map[string][]gin.H{
		"guests":   append(guestsVC, guestsPVE...),
		"hosts":    append(hostsVC, hostsPVE...),
		"storage":  append(storageRows, storagePVE...),
		"activity": append(activityRows, activityPVE...),
	}, warnings)
	summary["providerCounts"] = summary["providers"]
	summary["providers"] = providers
	c.JSON(http.StatusOK, summary)
}

func MountComputeRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/compute")
	g.GET("/providers", func(c *gin.Context) { handleComputeProviders(c, app) })
	g.GET("/summary", func(c *gin.Context) { handleComputeSummary(c, app) })
	g.GET("/guests", func(c *gin.Context) { handleComputeGuests(c, app) })
	g.GET("/hosts", func(c *gin.Context) { handleComputeHosts(c, app) })
	g.GET("/storage", func(c *gin.Context) { handleComputeStorage(c, app) })
	g.GET("/activity", func(c *gin.Context) { handleComputeActivity(c, app) })
}
