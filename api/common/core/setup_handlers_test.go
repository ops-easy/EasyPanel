package core

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestNewServerAppReportsUninitializedWhenBootstrapConfigMissing(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  address: 127.0.0.1:0
db:
  dsn: ""
redis:
  address: ""
startup:
  schedulers:
    enabled: false
performance:
  mode: debug
`), 0600); err != nil {
		t.Fatalf("write config: %v", err)
	}
	t.Setenv("EASYPANEL_CONFIG_FILE", configPath)

	app, err := NewServerApp(t.TempDir())
	if err != nil {
		t.Fatalf("NewServerApp: %v", err)
	}

	if app.Initialized() {
		t.Fatalf("app should remain uninitialized when MySQL, Redis and platform URL are missing")
	}
}

func TestHandleSetupSaveValidatesPayloadInsteadOfReturningDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := &ServerApp{dataDir: t.TempDir()}
	r := gin.New()
	r.POST("/api/setup", handleSetupSave(app))

	req := httptest.NewRequest(http.MethodPost, "/api/setup", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), "初始化向导已停用") {
		t.Fatalf("setup handler still returns the disabled response: %s", w.Body.String())
	}
}

func TestRegisterSystemPublicRoutesExposesSetupInitializationContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := &ServerApp{dataDir: t.TempDir()}
	r := gin.New()
	RegisterSystemPublicRoutes(r, app)

	wStatus := httptest.NewRecorder()
	r.ServeHTTP(wStatus, httptest.NewRequest(http.MethodGet, "/api/setup/status", nil))
	if wStatus.Code != http.StatusOK {
		t.Fatalf("GET /api/setup/status status = %d, body=%s", wStatus.Code, wStatus.Body.String())
	}
	var status struct {
		Initialized bool   `json:"initialized"`
		DataDir     string `json:"dataDir"`
		Version     int    `json:"version"`
		ConfigMode  string `json:"configMode"`
	}
	if err := json.Unmarshal(wStatus.Body.Bytes(), &status); err != nil {
		t.Fatalf("decode setup status: %v", err)
	}
	if status.Initialized {
		t.Fatalf("new app should report uninitialized")
	}
	if status.DataDir != app.DataDir() {
		t.Fatalf("dataDir = %q, want %q", status.DataDir, app.DataDir())
	}
	if status.Version != 1 {
		t.Fatalf("version = %d, want 1", status.Version)
	}
	if !strings.Contains(status.ConfigMode, "setup-config.yaml") {
		t.Fatalf("configMode should mention setup-config.yaml, got %q", status.ConfigMode)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/setup", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	wPost := httptest.NewRecorder()
	r.ServeHTTP(wPost, req)
	if wPost.Code != http.StatusBadRequest {
		t.Fatalf("POST /api/setup status = %d, want 400; body=%s", wPost.Code, wPost.Body.String())
	}
	if strings.Contains(wPost.Body.String(), "初始化向导已停用") {
		t.Fatalf("setup route regressed to disabled response: %s", wPost.Body.String())
	}
}

func TestSetupConfigYAMLIncludesBootstrapAndRuntimeFields(t *testing.T) {
	raw, err := setupConfigYAML(&RuntimeSettings{
		Version:              1,
		Initialized:          true,
		PlatformPublicURL:    "https://easypanel.example.com",
		MySQLHost:            "mysql.example.internal",
		MySQLPort:            3307,
		MySQLDatabase:        "easypanel",
		MySQLUser:            "easypanel_user",
		MySQLPassword:        "mysql-secret",
		RedisAddr:            "redis.example.internal:6380",
		RedisPassword:        "redis-secret",
		RedisDB:              2,
		EncryptionKey:        "1234567890abcdef",
		DashboardUser:        "root",
		DashboardSessionDays: 12,
		DashboardListenAddr:  ":18080",
		DDNSHost:             "ddns.example.com",
		DefaultPort:          "30443",
		K8s:                  &RuntimeK8s{Mode: "none"},
	}, "plain-secret", "session-secret")
	if err != nil {
		t.Fatalf("setupConfigYAML: %v", err)
	}

	var cfg Config
	applyConfigYAMLBytes(&cfg, raw, "setup")
	finalizeLoadedConfig(&cfg)

	if cfg.PlatformPublicURL != "https://easypanel.example.com" {
		t.Fatalf("PlatformPublicURL = %q", cfg.PlatformPublicURL)
	}
	if cfg.MySQLHost != "mysql.example.internal" || cfg.MySQLPort != 3307 ||
		cfg.MySQLDatabase != "easypanel" || cfg.MySQLUser != "easypanel_user" ||
		cfg.MySQLPassword != "mysql-secret" {
		t.Fatalf("MySQL bootstrap fields not rendered: %#v", cfg)
	}
	if cfg.RedisAddr != "redis.example.internal:6380" || cfg.RedisPassword != "redis-secret" || cfg.RedisDB != 2 {
		t.Fatalf("Redis bootstrap fields not rendered: %#v", cfg)
	}
	if cfg.DashboardUser != "root" || cfg.DashboardPassword != "plain-secret" ||
		cfg.DashboardSessionSecret != "session-secret" || cfg.DashboardSessionDays != 12 {
		t.Fatalf("dashboard bootstrap fields not rendered: %#v", cfg)
	}
	if cfg.configFileRuntime == nil || cfg.configFileRuntime.DDNSHost != "ddns.example.com" ||
		cfg.configFileRuntime.K8s == nil || cfg.configFileRuntime.K8s.Mode != "none" {
		t.Fatalf("runtime fields not rendered: %#v", cfg.configFileRuntime)
	}
}
