package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	networkmodel "kube-bt-sync/api/network/model"
	core "kube-bt-sync/common/core"
	transportauthz "kube-bt-sync/common/transport/authz"

	"github.com/gin-gonic/gin"
)

func TestNetworkKindValidation(t *testing.T) {
	for _, kind := range []string{"ikuai", "openwrt"} {
		if got, err := normalizeNetworkDeviceKind(kind); err != nil || got != kind {
			t.Fatalf("normalizeNetworkDeviceKind(%q)=(%q,%v), want (%q,nil)", kind, got, err, kind)
		}
	}
	for _, kind := range []string{"routeros", "pfsense", ""} {
		if _, err := normalizeNetworkDeviceKind(kind); err == nil {
			t.Fatalf("normalizeNetworkDeviceKind(%q) returned nil error, want error", kind)
		}
	}
}

func TestNetworkPrometheusScopeValidation(t *testing.T) {
	cases := map[string]string{
		"":          "network",
		"network":   "network",
		"vcenter":   "vcenter",
		"default":   "default",
		" NETWORK ": "network",
	}
	for in, want := range cases {
		got, err := normalizeNetworkPrometheusScope(in)
		if err != nil {
			t.Fatalf("normalizeNetworkPrometheusScope(%q) returned error: %v", in, err)
		}
		if got != want {
			t.Fatalf("normalizeNetworkPrometheusScope(%q)=%q, want %q", in, got, want)
		}
	}
	if _, err := normalizeNetworkPrometheusScope("cloud"); err == nil {
		t.Fatalf("normalizeNetworkPrometheusScope(cloud) returned nil error, want error")
	}
}

func TestRequireNetworkAdminAllowsCustomNetworkRW(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/api/network/devices", nil)
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleViewer)
	core.SetDashboardPermissionsGin(c, &core.EffectiveDashboardPermissions{
		Network: core.ModuleAccessRW,
	})

	if !requireNetworkAdmin(c) {
		t.Fatalf("network=rw viewer should be allowed to write network devices")
	}
}

func TestRequireNetworkAdminRejectsCustomNetworkRO(t *testing.T) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/network/devices", nil)
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleViewer)
	core.SetDashboardPermissionsGin(c, &core.EffectiveDashboardPermissions{
		Network: core.ModuleAccessRO,
	})

	if requireNetworkAdmin(c) {
		t.Fatalf("network=ro viewer should not be allowed to write network devices")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("network=ro response status=%d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestOpenWrtFamilyProbeHints(t *testing.T) {
	families := openWrtMetricFamiliesFromNames([]string{
		"node_load1",
		"node_network_receive_bytes_total",
		"node_openwrt_wifi_station_signal_dbm",
	})
	if !families.System || !families.Interfaces || !families.WiFi {
		t.Fatalf("expected system/interfaces/wifi families, got %+v", families)
	}
	if families.DHCP || families.Netstat {
		t.Fatalf("did not expect dhcp/netstat families, got %+v", families)
	}
	hints := families.MissingHints()
	if len(hints) != 2 {
		t.Fatalf("MissingHints length=%d, want 2: %#v", len(hints), hints)
	}
}

func TestIkuaiStreamPerfRowFromRaw(t *testing.T) {
	bytesRow := ikuaiStreamPerfRowFromRaw(2048, 1024, "bytes")
	if got := bytesRow["netRx"].(float64); got != 2 {
		t.Fatalf("bytes netRx=%v, want 2", got)
	}
	if got := bytesRow["netTx"].(float64); got != 1 {
		t.Fatalf("bytes netTx=%v, want 1", got)
	}

	kbsRow := ikuaiStreamPerfRowFromRaw(128, 64, "kbs")
	if got := kbsRow["netRx"].(float64); got != 128 {
		t.Fatalf("kbs netRx=%v, want 128", got)
	}
	if got := kbsRow["netRxUnit"].(string); got != "kiloBytesPerSecond" {
		t.Fatalf("netRxUnit=%q, want kiloBytesPerSecond", got)
	}
}

func TestIkuaiQueryCatalogCoversModernAndLegacyExporters(t *testing.T) {
	if len(ikuaiModernDownloadByIPQueries) == 0 || len(ikuaiModernUploadByIPQueries) == 0 {
		t.Fatalf("modern iKuai query lists must not be empty")
	}
	if len(ikuaiClientDownloadByIPQueries) == 0 || len(ikuaiClientUploadByIPQueries) == 0 {
		t.Fatalf("legacy iKuai query lists must not be empty")
	}
}

func TestOpenWrtDeviceDefaultsRootSSH(t *testing.T) {
	got := normalizeNetworkDeviceInput(networkmodel.Device{
		Kind:   "openwrt",
		Name:   "home",
		APIURL: "https://router.lan",
	})
	if got.Host != "router.lan" || got.Port != 22 || got.Username != "root" || got.AuthType != "ssh-password" {
		t.Fatalf("unexpected OpenWrt defaults: %+v", got)
	}
}

func TestOpenWrtManagementRoutesAreRegistered(t *testing.T) {
	router := gin.New()
	api := router.Group("/api")
	RegisterRoutes(api, nil)

	want := []struct {
		method string
		path   string
	}{
		{"POST", "/api/network/devices/openwrt/probe"},
		{"GET", "/api/network/devices/:id/openwrt/overview"},
		{"GET", "/api/network/devices/:id/openwrt/interfaces"},
		{"GET", "/api/network/devices/:id/openwrt/clients"},
		{"GET", "/api/network/devices/:id/openwrt/wireless"},
		{"GET", "/api/network/devices/:id/openwrt/firewall"},
		{"POST", "/api/network/devices/:id/openwrt/actions"},
		{"POST", "/api/network/devices/:id/openwrt/config/dry-run"},
		{"POST", "/api/network/devices/:id/openwrt/config/apply"},
	}
	for _, route := range want {
		found := false
		for _, got := range router.Routes() {
			if got.Method == route.method && got.Path == route.path {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("missing route %s %s", route.method, route.path)
		}
	}
}
