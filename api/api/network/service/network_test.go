package service

import "testing"

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
