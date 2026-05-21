package provider

import "testing"

func TestNormalizeBaseURL(t *testing.T) {
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
			got, err := NormalizeBaseURL(tc.in)
			if err != nil {
				t.Fatalf("NormalizeBaseURL returned error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("NormalizeBaseURL(%q)=%q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestBuildAuthHeader(t *testing.T) {
	got := BuildAuthHeader("root@pam!kubebt", "secret")
	want := "PVEAPIToken=root@pam!kubebt=secret"
	if got != want {
		t.Fatalf("BuildAuthHeader()=%q, want %q", got, want)
	}
}

func TestGuestPowerPath(t *testing.T) {
	got, err := GuestPowerPath("pve-a", "qemu", "101", "start")
	if err != nil {
		t.Fatalf("GuestPowerPath returned error: %v", err)
	}
	if got != "/nodes/pve-a/qemu/101/status/start" {
		t.Fatalf("GuestPowerPath()=%q", got)
	}
}
