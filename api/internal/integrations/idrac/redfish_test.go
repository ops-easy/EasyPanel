package idrac

import "testing"

func TestIdracHostConfigFromFlatNormalizesBaseURL(t *testing.T) {
	cfg, err := IdracHostConfigFromFlat(" 10.0.0.7/redfish-root/ ", " root ", "secret", true)
	if err != nil {
		t.Fatalf("IdracHostConfigFromFlat(): %v", err)
	}
	if cfg.BaseURL != "https://10.0.0.7/redfish-root" {
		t.Fatalf("BaseURL = %q", cfg.BaseURL)
	}
	if cfg.User != "root" || cfg.Password != "secret" || !cfg.Insecure {
		t.Fatalf("unexpected config: %#v", cfg)
	}
}

func TestNormalizeRedfishBaseRejectsEmptyHost(t *testing.T) {
	if _, err := normalizeRedfishBase("https:///redfish"); err == nil {
		t.Fatal("expected error")
	}
}
