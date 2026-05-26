package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	pvemodel "github.com/ops-easy/EasyPanel/api/api/pve/model"
	core "github.com/ops-easy/EasyPanel/api/common/core"
	transportauthz "github.com/ops-easy/EasyPanel/api/common/transport/authz"

	"github.com/gin-gonic/gin"
)

func TestPVENormalizeBaseURL(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "bare host gets https and default port", in: "10.0.0.5", want: "https://10.0.0.5:8006"},
		{name: "host with scheme gets default port", in: "https://pve.local", want: "https://pve.local:8006"},
		{name: "api path is trimmed", in: "https://10.0.0.5:8006/api2/json", want: "https://10.0.0.5:8006"},
		{name: "trailing slash is trimmed", in: "https://10.0.0.5:8006/", want: "https://10.0.0.5:8006"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizePVEBaseURL(tc.in)
			if err != nil {
				t.Fatalf("normalizePVEBaseURL returned error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("normalizePVEBaseURL(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestPVEBuildAuthHeader(t *testing.T) {
	got := buildPVEAuthHeader("root@pam!easypanel", "secret")
	want := "PVEAPIToken=root@pam!easypanel=secret"
	if got != want {
		t.Fatalf("buildPVEAuthHeader()=%q, want %q", got, want)
	}
}

func TestPVEGuestPowerActionValidation(t *testing.T) {
	for _, action := range []string{"start", "stop", "shutdown", "reboot", "reset"} {
		if err := validatePVEGuestPowerAction(action); err != nil {
			t.Fatalf("validatePVEGuestPowerAction(%q) returned error: %v", action, err)
		}
	}
	for _, action := range []string{"destroy", "pause", "", " start "} {
		if err := validatePVEGuestPowerAction(action); err == nil {
			t.Fatalf("validatePVEGuestPowerAction(%q) returned nil, want error", action)
		}
	}
}

func TestPVEGuestDetailAndMetricsPaths(t *testing.T) {
	status, config, err := pveGuestDetailPaths("pve-a", "vm", "101")
	if err != nil {
		t.Fatalf("pveGuestDetailPaths returned error: %v", err)
	}
	if status != "/nodes/pve-a/qemu/101/status/current" {
		t.Fatalf("status path=%q", status)
	}
	if config != "/nodes/pve-a/qemu/101/config" {
		t.Fatalf("config path=%q", config)
	}

	metrics, err := pveGuestMetricsPath("pve-a", "ct", "102")
	if err != nil {
		t.Fatalf("pveGuestMetricsPath returned error: %v", err)
	}
	if metrics != "/nodes/pve-a/lxc/102/rrddata" {
		t.Fatalf("metrics path=%q", metrics)
	}
}

func TestPVENodeDetailAndMetricsPaths(t *testing.T) {
	status, version, err := pveNodeDetailPaths("pve-a")
	if err != nil {
		t.Fatalf("pveNodeDetailPaths returned error: %v", err)
	}
	if status != "/nodes/pve-a/status" {
		t.Fatalf("status path=%q", status)
	}
	if version != "/nodes/pve-a/version" {
		t.Fatalf("version path=%q", version)
	}

	metrics, err := pveNodeMetricsPath("pve-a")
	if err != nil {
		t.Fatalf("pveNodeMetricsPath returned error: %v", err)
	}
	if metrics != "/nodes/pve-a/rrddata" {
		t.Fatalf("metrics path=%q", metrics)
	}
}

func TestPVEFullTakeoverPaths(t *testing.T) {
	console, err := pveGuestConsoleWebSocketPath("pve-a", "qemu", "101")
	if err != nil {
		t.Fatalf("console path: %v", err)
	}
	if console != "/nodes/pve-a/qemu/101/vncwebsocket" {
		t.Fatalf("console path=%q", console)
	}

	resize, err := pveGuestDiskResizePath("pve-a", "lxc", "102")
	if err != nil {
		t.Fatalf("resize path: %v", err)
	}
	if resize != "/nodes/pve-a/lxc/102/resize" {
		t.Fatalf("resize path=%q", resize)
	}

	snapshots, err := pveGuestSnapshotsPath("pve-a", "vm", "103")
	if err != nil {
		t.Fatalf("snapshots path: %v", err)
	}
	if snapshots != "/nodes/pve-a/qemu/103/snapshot" {
		t.Fatalf("snapshots path=%q", snapshots)
	}

	rollback, err := pveGuestSnapshotRollbackPath("pve-a", "vm", "103", "before-upgrade")
	if err != nil {
		t.Fatalf("rollback path: %v", err)
	}
	if rollback != "/nodes/pve-a/qemu/103/snapshot/before-upgrade/rollback" {
		t.Fatalf("rollback path=%q", rollback)
	}
}

func TestPVETargetCreateReplacesExistingSingleton(t *testing.T) {
	list := []pvemodel.Target{
		{ID: "pve-new", Name: "PVE New", BaseURL: "https://pve-new.example.com:8006"},
		{ID: "pve-old", Name: "PVE Old", BaseURL: "https://pve-old.example.com:8006"},
	}

	collapsed := collapsePVETargetsToSingleton(list)

	if len(collapsed) != 1 {
		t.Fatalf("expected one effective PVE target, got %d", len(collapsed))
	}
	if collapsed[0].ID != "pve-new" {
		t.Fatalf("expected first target to win, got %q", collapsed[0].ID)
	}
}

func TestPVESingleTargetReturnsEmptyForUnconfigured(t *testing.T) {
	target, ok := singlePVETargetFromList([]pvemodel.Target{})
	if ok {
		t.Fatalf("expected no singleton PVE target, got %#v", target)
	}
}

func TestRequirePVEAdminAllowsCustomComputeRW(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/api/pve/targets", nil)
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleViewer)
	core.SetDashboardPermissionsGin(c, &core.EffectiveDashboardPermissions{
		Compute: core.ModuleAccessRW,
	})

	if !requirePVEAdmin(c) {
		t.Fatalf("compute=rw viewer should be allowed to write PVE targets")
	}
}

func TestRequirePVEAdminRejectsCustomComputeRO(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/pve/targets", nil)
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleViewer)
	core.SetDashboardPermissionsGin(c, &core.EffectiveDashboardPermissions{
		Compute: core.ModuleAccessRO,
	})

	if requirePVEAdmin(c) {
		t.Fatalf("compute=ro viewer should not be allowed to write PVE targets")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("compute=ro response status=%d, want %d", w.Code, http.StatusForbidden)
	}
}
