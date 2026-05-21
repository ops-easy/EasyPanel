package router

import (
	"os"
	"path/filepath"
	"testing"

	"kube-bt-sync/common/appctx"

	"github.com/gin-gonic/gin"
)

func TestRegisterRoutesProductionContracts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  address: 127.0.0.1:0
  sessionSecret: route-test-secret
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
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)

	app, err := appctx.NewServerApp(t.TempDir())
	if err != nil {
		t.Fatalf("new server app: %v", err)
	}
	r := gin.New()
	RegisterRoutes(r, app)

	routes := map[string]struct{}{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = struct{}{}
	}

	for _, want := range []string{
		"GET /api/health",
		"GET /api/config",
		"GET /api/k8s/summary",
		"GET /api/app-center/redis/status",
		"GET /api/bastion/targets",
		"GET /api/dns/status",
		"GET /r/*rp",
		"POST /r/*rp",
		"GET /d/:token",
	} {
		if _, ok := routes[want]; !ok {
			t.Fatalf("production route %s is not registered", want)
		}
	}
}
