package core

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestComputeStatusInfoNormalizesProviderStates(t *testing.T) {
	tests := []struct {
		name        string
		status      string
		wantLabel   string
		wantHealth  string
		wantRunning bool
	}{
		{name: "vcenter powered on", status: "poweredOn", wantLabel: "运行中", wantHealth: "ok", wantRunning: true},
		{name: "pve running", status: "running", wantLabel: "运行中", wantHealth: "ok", wantRunning: true},
		{name: "host online", status: "online", wantLabel: "在线", wantHealth: "ok", wantRunning: true},
		{name: "powered off is idle not broken", status: "poweredOff", wantLabel: "已停止", wantHealth: "idle"},
		{name: "failed is critical", status: "failed", wantLabel: "异常", wantHealth: "critical"},
		{name: "not responding is critical", status: "notResponding", wantLabel: "无响应", wantHealth: "critical"},
		{name: "empty is unknown", status: "", wantLabel: "未知", wantHealth: "unknown"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := computeStatusInfo(tt.status)
			if got.Label != tt.wantLabel {
				t.Fatalf("label = %q, want %q", got.Label, tt.wantLabel)
			}
			if got.Health != tt.wantHealth {
				t.Fatalf("health = %q, want %q", got.Health, tt.wantHealth)
			}
			if got.Running != tt.wantRunning {
				t.Fatalf("running = %v, want %v", got.Running, tt.wantRunning)
			}
		})
	}
}

func TestComputeEnrichRowAddsStatusUsageKindAndActions(t *testing.T) {
	row := gin.H{
		"provider":     "pve",
		"status":       "running",
		"capabilities": []string{"detail", "ssh"},
		"source": map[string]any{
			"cpu":     0.42,
			"mem":     float64(6 << 30),
			"maxmem":  float64(12 << 30),
			"disk":    float64(20 << 30),
			"maxdisk": float64(100 << 30),
		},
	}

	computeEnrichRow(row, "guest")

	if row["kind"] != "guest" {
		t.Fatalf("kind = %v, want guest", row["kind"])
	}
	if row["statusLabel"] != "运行中" {
		t.Fatalf("statusLabel = %v, want 运行中", row["statusLabel"])
	}
	if row["health"] != "ok" {
		t.Fatalf("health = %v, want ok", row["health"])
	}
	if row["running"] != true {
		t.Fatalf("running = %v, want true", row["running"])
	}
	actions, ok := row["actions"].([]string)
	if !ok || len(actions) != 2 || actions[0] != "detail" || actions[1] != "ssh" {
		t.Fatalf("actions = %#v, want copied capabilities", row["actions"])
	}
	usage, ok := row["usage"].(gin.H)
	if !ok {
		t.Fatalf("usage type = %T, want gin.H", row["usage"])
	}
	if usage["cpuPct"] != 42.0 {
		t.Fatalf("cpuPct = %v, want 42", usage["cpuPct"])
	}
	if usage["memoryPct"] != 50.0 {
		t.Fatalf("memoryPct = %v, want 50", usage["memoryPct"])
	}
	if usage["diskPct"] != 20.0 {
		t.Fatalf("diskPct = %v, want 20", usage["diskPct"])
	}
}

func TestComputeSummaryCountsRowsByHealthAndProvider(t *testing.T) {
	rowsByKind := map[string][]gin.H{
		"guests": {
			{"provider": "vcenter", "health": "ok"},
			{"provider": "pve", "health": "idle"},
		},
		"hosts": {
			{"provider": "vcenter", "health": "critical"},
		},
		"storage": {
			{"provider": "pve", "health": "warning"},
		},
		"activity": {
			{"provider": "pve", "health": "unknown"},
		},
	}

	summary := computeBuildSummary(rowsByKind, []string{"vCenter 事件缓存为空"})
	counts := summary["counts"].(gin.H)
	if counts["guests"] != 2 || counts["hosts"] != 1 || counts["storage"] != 1 || counts["activity"] != 1 {
		t.Fatalf("counts = %#v", counts)
	}
	health := summary["health"].(gin.H)
	if health["ok"] != 1 || health["idle"] != 1 || health["warning"] != 1 || health["critical"] != 1 || health["unknown"] != 1 {
		t.Fatalf("health = %#v", health)
	}
	providers := summary["providers"].(gin.H)
	if providers["vcenter"] != 2 || providers["pve"] != 3 {
		t.Fatalf("providers = %#v", providers)
	}
	if summary["warningCount"] != 1 {
		t.Fatalf("warningCount = %v, want 1", summary["warningCount"])
	}
}
