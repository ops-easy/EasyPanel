package service

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
	core "github.com/ops-easy/EasyPanel/backend/common/core"
	transportauthz "github.com/ops-easy/EasyPanel/backend/common/transport/authz"

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

func TestNetworkDevicesCollapseOnePerKind(t *testing.T) {
	list := []networkmodel.Device{
		{ID: "ikuai-new", Kind: "ikuai", Name: "iKuai New", PrometheusScope: "network"},
		{ID: "ikuai-old", Kind: "ikuai", Name: "iKuai Old", PrometheusScope: "network"},
		{ID: "openwrt-new", Kind: "openwrt", Name: "OpenWrt New", Host: "192.168.1.2", Port: 22, Username: "root", PrometheusScope: "network"},
		{ID: "openwrt-old", Kind: "openwrt", Name: "OpenWrt Old", Host: "192.168.1.3", Port: 22, Username: "root", PrometheusScope: "network"},
	}

	collapsed := collapseNetworkDevicesToSingletons(list)

	if len(collapsed) != 2 {
		t.Fatalf("expected one iKuai and one OpenWrt, got %d", len(collapsed))
	}
	if collapsed[0].ID != "ikuai-new" {
		t.Fatalf("expected first iKuai to win, got %q", collapsed[0].ID)
	}
	if collapsed[1].ID != "openwrt-new" {
		t.Fatalf("expected first OpenWrt to win, got %q", collapsed[1].ID)
	}
}

func TestUpsertNetworkDeviceByKindReplacesSameKindAndPreservesOtherKind(t *testing.T) {
	cur := []networkmodel.Device{
		{ID: "ikuai-old", Kind: "ikuai", Name: "iKuai Old", PrometheusScope: "network"},
		{ID: "openwrt-old", Kind: "openwrt", Name: "OpenWrt Old", Host: "192.168.1.3", Port: 22, Username: "root", PrometheusScope: "network"},
	}
	next := networkmodel.Device{ID: "ikuai-new", Kind: "ikuai", Name: "iKuai New", PrometheusScope: "network"}

	out := upsertNetworkDeviceByKind(cur, next)

	if len(out) != 2 {
		t.Fatalf("expected two devices after upsert, got %d", len(out))
	}
	if out[0].ID != "ikuai-new" {
		t.Fatalf("expected iKuai replacement at front, got %q", out[0].ID)
	}
	if out[1].ID != "openwrt-old" {
		t.Fatalf("expected OpenWrt to be preserved, got %q", out[1].ID)
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

func TestIkuaiDeviceStoresHTTPManagementFieldsEncrypted(t *testing.T) {
	key := []byte("12345678901234567890123456789012")
	dev, err := normalizeNetworkDeviceFromBody(networkDeviceBody{
		Kind:            "ikuai",
		Name:            "main router",
		APIURL:          "https://ikuai.lan",
		Host:            "192.168.1.1",
		Port:            8443,
		AuthType:        "http-web",
		Username:        "admin",
		Password:        "secret-pass",
		SkipTLSVerify:   true,
		PrometheusScope: "network",
		InstanceLabel:   "192.168.1.1:9100",
		JobLabel:        "ikuai",
	}, nil, key)
	if err != nil {
		t.Fatalf("normalize iKuai device returned error: %v", err)
	}
	if dev.APIURL != "https://ikuai.lan" || dev.Host != "192.168.1.1" || dev.Port != 8443 || dev.AuthType != ikuaiAuthTypeHTTPWeb || dev.Username != "admin" || !dev.SkipTLSVerify {
		t.Fatalf("iKuai management fields were not preserved: %+v", dev)
	}
	if dev.PasswordEnc == "" || strings.Contains(dev.PasswordEnc, "secret-pass") || dev.Password != "" {
		t.Fatalf("iKuai password should be encrypted and omitted from runtime response: %+v", dev)
	}
	item := networkDeviceListItem(dev)
	if !item.PasswordSet || item.PrivateKeySet {
		t.Fatalf("unexpected list item secret flags: %+v", item)
	}
}

func TestIkuaiLoginPayloadDoesNotExposeRawPassword(t *testing.T) {
	payload := buildIkuaiLoginPayload("admin", "secret-pass")
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal iKuai login payload: %v", err)
	}
	if strings.Contains(string(raw), "secret-pass") {
		t.Fatalf("login payload must not contain raw password: %s", string(raw))
	}
	if payload["username"] != "admin" {
		t.Fatalf("username=%v, want admin", payload["username"])
	}
	if payload["passwd"] == "" && payload["pass"] == "" {
		t.Fatalf("login payload should include hashed password fields: %#v", payload)
	}
}

func TestOpenWrtConfigCommandsSupportDeleteAndCommit(t *testing.T) {
	preview, err := buildOpenWrtConfigCommands(openWrtConfigRequest{
		Changes: []openWrtConfigChange{
			{Operation: "set", Section: "network.lan.ipaddr", Value: "192.168.2.1"},
			{Operation: "delete", Section: "dhcp.@host[0]"},
		},
		Reload: "network",
	})
	if err != nil {
		t.Fatalf("build commands returned error: %v", err)
	}
	got := strings.Join(preview.Commands, "\n")
	for _, want := range []string{
		"uci set network.lan.ipaddr='192.168.2.1'",
		"uci delete dhcp.@host[0]",
		"uci commit dhcp",
		"uci commit network",
		"/etc/init.d/network reload",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("preview commands missing %q in:\n%s", want, got)
		}
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

func TestNetworkProviderConfigRoutesAreRegistered(t *testing.T) {
	router := gin.New()
	api := router.Group("/api")
	RegisterRoutes(api, nil)

	want := []struct {
		method string
		path   string
	}{
		{"POST", "/api/network/devices/ikuai/probe"},
		{"GET", "/api/network/devices/:id/:provider/config/:domain"},
		{"POST", "/api/network/devices/:id/:provider/config/:domain/dry-run"},
		{"POST", "/api/network/devices/:id/:provider/config/:domain/apply"},
		{"POST", "/api/network/devices/:id/:provider/actions"},
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
