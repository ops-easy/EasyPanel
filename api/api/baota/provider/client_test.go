package provider

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJoinURL(t *testing.T) {
	got := JoinURL(" https://panel.example/ ", "site?action=SetSSL")
	want := "https://panel.example/site?action=SetSSL"
	if got != want {
		t.Fatalf("JoinURL() = %q, want %q", got, want)
	}
}

func TestParseURLHostPortDefaultPorts(t *testing.T) {
	host, port, err := ParseURLHostPort("https://panel.example")
	if err != nil {
		t.Fatalf("ParseURLHostPort(): %v", err)
	}
	if host != "panel.example" || port != "443" {
		t.Fatalf("got %s:%s, want panel.example:443", host, port)
	}
}

func TestCallAPIDetectsAlreadyExists(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("method = %s, want POST", r.Method)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm(): %v", err)
		}
		if r.Form.Get("request_time") == "" || r.Form.Get("request_token") == "" {
			t.Fatal("expected signed request fields")
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":false,"msg":"site already exists"}`))
	}))
	defer srv.Close()

	_, err := CallAPI(Options{URL: srv.URL, APIKey: "secret"}, "/site?action=AddSite", map[string]string{"webname": "demo"})
	if !IsAlreadyExists(err) {
		t.Fatalf("expected already-exists error, got %v", err)
	}
}
