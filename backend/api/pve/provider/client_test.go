package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
)

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
	got := BuildAuthHeader("root@pam!easypanel", "secret")
	want := "PVEAPIToken=root@pam!easypanel=secret"
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

func TestPasswordClientLogsInAndUsesTicketHeaders(t *testing.T) {
	var loginCount int
	mux := http.NewServeMux()
	mux.HandleFunc("/api2/json/access/ticket", func(w http.ResponseWriter, r *http.Request) {
		loginCount++
		if r.Method != http.MethodPost {
			t.Fatalf("login method=%s, want POST", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm returned error: %v", err)
		}
		if got := r.Form.Get("username"); got != "root@pam" {
			t.Fatalf("username=%q, want root@pam", got)
		}
		if got := r.Form.Get("password"); got != "secret-pass" {
			t.Fatalf("password=%q, want secret-pass", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"data": map[string]string{
				"ticket":              "PVE:ticket",
				"CSRFPreventionToken": "csrf-token",
			},
		})
	})
	mux.HandleFunc("/api2/json/nodes", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "" {
			t.Fatalf("password auth should not send Authorization header, got %q", got)
		}
		cookie, err := r.Cookie("PVEAuthCookie")
		if err != nil {
			t.Fatalf("PVEAuthCookie missing: %v", err)
		}
		if cookie.Value != "PVE:ticket" {
			t.Fatalf("PVEAuthCookie=%q, want ticket", cookie.Value)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": []string{"pve-a"}})
	})
	mux.HandleFunc("/api2/json/nodes/pve-a/qemu/101/status/start", func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("CSRFPreventionToken"); got != "csrf-token" {
			t.Fatalf("CSRFPreventionToken=%q, want csrf-token", got)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"data": nil})
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	client, err := NewClient(pvemodel.Target{
		BaseURL:    srv.URL,
		AuthMethod: "password",
		Username:   "root",
		Realm:      "pam",
		SkipTLS:    true,
	}, "secret-pass")
	if err != nil {
		t.Fatalf("NewClient returned error: %v", err)
	}
	if _, err := client.Do(context.Background(), http.MethodGet, "/nodes", nil, nil); err != nil {
		t.Fatalf("GET Do returned error: %v", err)
	}
	if _, err := client.Do(context.Background(), http.MethodPost, "/nodes/pve-a/qemu/101/status/start", url.Values{}, map[string]string{}); err != nil {
		t.Fatalf("POST Do returned error: %v", err)
	}
	if loginCount != 1 {
		t.Fatalf("loginCount=%d, want 1", loginCount)
	}
}
