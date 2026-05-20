package service

import "testing"

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
	got := buildPVEAuthHeader("root@pam!kubebt", "secret")
	want := "PVEAPIToken=root@pam!kubebt=secret"
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
