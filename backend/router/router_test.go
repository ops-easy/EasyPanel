package router

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ops-easy/EasyPanel/backend/common/appctx"

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
	t.Setenv("EASYPANEL_CONFIG_FILE", configPath)

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
		"GET /api/compute/providers",
		"GET /api/compute/summary",
		"GET /api/compute/guests",
		"GET /api/compute/hosts",
		"GET /api/compute/storage",
		"GET /api/compute/activity",
		"GET /api/k8s/summary",
		"GET /api/app-center/redis/status",
		"GET /api/app-center/mysql/status",
		"POST /api/app-center/mysql/k8s-deploy",
		"GET /api/bastion/targets",
		"POST /api/pve/targets/:id/guests/:vmid/snapshots/:snapname/rollback",
		"GET /api/vcenter/vms/:moref/snapshots",
		"POST /api/vcenter/vms/:moref/snapshots",
		"POST /api/vcenter/vms/:moref/snapshots/:name/revert",
		"DELETE /api/vcenter/vms/:moref/snapshots/:name",
		"GET /api/vcenter/datastores",
		"GET /api/dns/status",
		"GET /api/ops/ai-chat/status",
		"POST /api/ops/ai-chat",
		"POST /api/ops/ai-chat/stream",
		"GET /r/*rp",
		"POST /r/*rp",
		"GET /d/:token",
	} {
		if _, ok := routes[want]; !ok {
			t.Fatalf("production route %s is not registered", want)
		}
	}
}
