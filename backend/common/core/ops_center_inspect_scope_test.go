package core

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestInspectPrometheusScopeRowsIncludesCurrentPlatformScopes(t *testing.T) {
	rows := inspectPrometheusScopeRows(OpsAIInspectConfig{
		InspectPrometheusK8s:     true,
		InspectPrometheusVCenter: true,
		InspectPrometheusPVE:     true,
		InspectPrometheusNetwork: true,
	})

	if got, want := len(rows), 4; got != want {
		t.Fatalf("scope rows=%d, want %d", got, want)
	}
	wantScopes := []string{"k8s", "vcenter", "pve", "network"}
	for i, want := range wantScopes {
		if rows[i].Scope != want || !rows[i].Enabled {
			t.Fatalf("rows[%d]=%#v, want enabled scope %q", i, rows[i], want)
		}
	}
}

func TestLoadInspectNetworkDevicesCountsOpenWrtAndIkuai(t *testing.T) {
	kv := newTestPlatformKV()
	raw, err := json.Marshal(map[string]any{
		"devices": []map[string]any{
			{"id": "ow-1", "name": "OpenWrt LAN", "kind": "openwrt", "apiUrl": "http://192.168.1.1"},
			{"id": "ik-1", "name": "iKuai Edge", "kind": "ikuai", "apiUrl": "http://192.168.1.2"},
		},
	})
	if err != nil {
		t.Fatalf("marshal network payload: %v", err)
	}
	kv.data[kvKeyInspectNetworkDevices] = string(raw)

	devices, err := loadInspectNetworkDevices(kv)
	if err != nil {
		t.Fatalf("loadInspectNetworkDevices returned error: %v", err)
	}
	if got, want := len(devices), 2; got != want {
		t.Fatalf("devices=%d, want %d", got, want)
	}
	counts := inspectNetworkKindCounts(devices)
	if counts["openwrt"] != 1 || counts["ikuai"] != 1 {
		t.Fatalf("kind counts=%v, want one OpenWrt and one iKuai", counts)
	}
}

func TestInspectCollectPVESectionWarnsWhenEnabledWithoutTarget(t *testing.T) {
	app := &ServerApp{platformKV: newTestPlatformKV()}
	sec := inspectCollectPVESection(context.Background(), app, Config{}, OpsAIInspectConfig{InspectPVE: true})

	if sec.Status != "warn" {
		t.Fatalf("status=%q, want warn", sec.Status)
	}
	if !strings.Contains(sec.Markdown, "未配置 PVE") {
		t.Fatalf("markdown=%q, want missing PVE target warning", sec.Markdown)
	}
}

func TestInspectCollectNetworkSectionSummarizesDevicesAndWarnsForMissingPrometheus(t *testing.T) {
	kv := newTestPlatformKV()
	raw, err := json.Marshal(map[string]any{
		"devices": []map[string]any{
			{"id": "ow-1", "name": "OpenWrt LAN", "kind": "openwrt", "apiUrl": "http://192.168.1.1"},
			{"id": "ik-1", "name": "iKuai Edge", "kind": "ikuai", "apiUrl": "http://192.168.1.2"},
		},
	})
	if err != nil {
		t.Fatalf("marshal network payload: %v", err)
	}
	kv.data[kvKeyInspectNetworkDevices] = string(raw)
	app := &ServerApp{platformKV: kv}

	sec := inspectCollectNetworkSection(context.Background(), app, Config{}, OpsAIInspectConfig{
		InspectNetwork:           true,
		InspectPrometheusNetwork: true,
	})
	if sec.Status != "warn" {
		t.Fatalf("status=%q, want warn for missing network Prometheus", sec.Status)
	}
	for _, needle := range []string{"OpenWrt：1", "iKuai：1", "OpenWrt LAN", "iKuai Edge", "Prometheus（网络设备数据源）"} {
		if !strings.Contains(sec.Markdown, needle) {
			t.Fatalf("markdown missing %q: %s", needle, sec.Markdown)
		}
	}
}
