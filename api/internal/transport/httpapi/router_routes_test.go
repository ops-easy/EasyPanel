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
		"GET /api/k8s/summary",
		"GET /api/prometheus/query",
		"GET /api/vcenter/status",
		"GET /api/app-center/redis/status",
		"GET /api/dns/status",
		"GET /api/docs",
	}
	for _, key := range required {
		if !routes[key] {
			t.Fatalf("missing route %s", key)
		}
	}
}
