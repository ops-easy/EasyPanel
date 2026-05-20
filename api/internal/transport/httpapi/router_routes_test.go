package httpapi

import (
	"testing"

	core "kube-bt-sync/internal"
)

func TestRouterRegistersCriticalRoutes(t *testing.T) {
	app := &core.ServerApp{}
	r := NewRouter(app)
	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}

	required := []string{
		"GET /api/health",
		"GET /api/auth/status",
		"POST /api/auth/login",
		"GET /api/baota/ingress-sync/status",
		"GET /api/harbor/status",
		"GET /api/k8s/summary",
		"POST /api/hooks/alertmanager",
		"GET /api/prometheus/query",
		"GET /api/vcenter/status",
		"GET /api/app-center/redis/status",
		"GET /api/dns/status",
		"GET /api/docs",
		"GET /api/settings/runtime",
		"GET /api/toolbox/ip-scan/config",
	}
	for _, key := range required {
		if !routes[key] {
			t.Fatalf("missing route %s", key)
		}
	}
}
