package provider

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestConfiguredAndAPIRoot(t *testing.T) {
	if !Configured(" https://harbor.example/ ", "user", "pass") {
		t.Fatal("expected complete config to be configured")
	}
	if Configured("", "user", "pass") || Configured("https://harbor.example", "", "pass") || Configured("https://harbor.example", "user", "") {
		t.Fatal("expected incomplete config to be unconfigured")
	}
	if got := APIRoot(" https://harbor.example/ "); got != "https://harbor.example/api/v2.0" {
		t.Fatalf("APIRoot = %q", got)
	}
}

func TestClientDo(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.String() != "/api/v2.0/projects?page=1" {
			t.Fatalf("path = %q", r.URL.String())
		}
		if r.Method != http.MethodGet {
			t.Fatalf("method = %s", r.Method)
		}
		u, p, ok := r.BasicAuth()
		if !ok || u != "robot" || p != "secret" {
			t.Fatalf("unexpected auth: %q %q %v", u, p, ok)
		}
		if r.Header.Get("Accept") != "application/json" {
			t.Fatalf("accept = %q", r.Header.Get("Accept"))
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	c := NewClient(ClientConfig{BaseURL: ts.URL, Username: " robot ", Password: "secret"})
	b, code, err := c.Do(context.Background(), http.MethodGet, "/projects?page=1", nil)
	if err != nil {
		t.Fatalf("Do returned error: %v", err)
	}
	if code != http.StatusAccepted || string(b) != `{"ok":true}` {
		t.Fatalf("unexpected response code=%d body=%s", code, string(b))
	}
}

func TestClientDoNotConfigured(t *testing.T) {
	c := NewClient(ClientConfig{})
	_, _, err := c.Do(context.Background(), http.MethodGet, "/ping", nil)
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err = %v, want ErrNotConfigured", err)
	}
}

func TestClientDoGET404RepoAlt(t *testing.T) {
	var seen []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.URL.Path)
		if r.URL.Path == "/api/v2.0/primary" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Path == "/api/v2.0/alt" {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"fallback":true}`))
			return
		}
		t.Fatalf("unexpected path %q", r.URL.Path)
	}))
	defer ts.Close()

	c := NewClient(ClientConfig{BaseURL: ts.URL})
	b, code, err := c.DoGET404RepoAlt(context.Background(), "/primary", "/alt")
	if err != nil {
		t.Fatalf("DoGET404RepoAlt returned error: %v", err)
	}
	if code != http.StatusOK || string(b) != `{"fallback":true}` {
		t.Fatalf("unexpected response code=%d body=%s", code, string(b))
	}
	if strings.Join(seen, ",") != "/api/v2.0/primary,/api/v2.0/alt" {
		t.Fatalf("seen paths = %#v", seen)
	}
}

func TestClientFetchSystemInfoMap(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2.0/systeminfo" {
			t.Fatalf("path = %q", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"external_url":"https://ui.example"}`))
	}))
	defer ts.Close()

	c := NewClient(ClientConfig{BaseURL: ts.URL})
	got := c.FetchSystemInfoMap(context.Background())
	if got["external_url"] != "https://ui.example" {
		t.Fatalf("unexpected system info: %#v", got)
	}
}
