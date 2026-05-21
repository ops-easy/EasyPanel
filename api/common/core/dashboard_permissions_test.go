package core

import "testing"

func TestAPIModulePrefixCoversComputeAndNetworkFeatures(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{path: "/api/vcenter/vms", want: "compute"},
		{path: "/api/cloud-hosts", want: "compute"},
		{path: "/api/toolbox/ip-scan", want: "compute"},
		{path: "/api/pve/targets", want: "compute"},
		{path: "/api/network/devices", want: "network"},
	}

	for _, tt := range tests {
		if got := apiModulePrefix(tt.path); got != tt.want {
			t.Fatalf("apiModulePrefix(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestEffectivePermissionsExposeComputeAndNetworkWithLegacyFallback(t *testing.T) {
	legacy := effectivePermissionsFromJSON(DashboardRoleViewer, `{"vcenter":"ro","k8s":"none","baota":"none","appcenter":"none"}`)
	if legacy.Compute != ModuleAccessRO {
		t.Fatalf("legacy Compute = %q, want %q", legacy.Compute, ModuleAccessRO)
	}
	if legacy.Network != ModuleAccessRO {
		t.Fatalf("legacy Network = %q, want %q", legacy.Network, ModuleAccessRO)
	}

	custom := effectivePermissionsFromJSON(DashboardRoleViewer, `{"vcenter":"none","compute":"ro","network":"rw","k8s":"none","baota":"none","appcenter":"none"}`)
	if custom.VCenter != ModuleAccessRO {
		t.Fatalf("custom VCenter = %q, want %q", custom.VCenter, ModuleAccessRO)
	}
	if custom.Compute != ModuleAccessRO {
		t.Fatalf("custom Compute = %q, want %q", custom.Compute, ModuleAccessRO)
	}
	if custom.Network != ModuleAccessRW {
		t.Fatalf("custom Network = %q, want %q", custom.Network, ModuleAccessRW)
	}

	public := EffectivePermissionsToPublic(custom)
	if public["compute"] != ModuleAccessRO {
		t.Fatalf("public compute = %v, want %q", public["compute"], ModuleAccessRO)
	}
	if public["network"] != ModuleAccessRW {
		t.Fatalf("public network = %v, want %q", public["network"], ModuleAccessRW)
	}
}

func TestPermissionEndpointForbiddenUsesComputeAndNetworkModules(t *testing.T) {
	eff := effectivePermissionsFromJSON(DashboardRoleViewer, `{"vcenter":"rw","compute":"none","network":"ro","k8s":"none","baota":"none","appcenter":"none"}`)

	if !permissionEndpointForbidden("GET", "/api/pve/targets", eff) {
		t.Fatalf("compute=none should block PVE API")
	}
	if !permissionEndpointForbidden("GET", "/api/vcenter/vms", eff) {
		t.Fatalf("compute=none should block vCenter API after compute workspace unification")
	}
	if permissionEndpointForbidden("GET", "/api/network/devices", eff) {
		t.Fatalf("network=ro should allow network read API")
	}
	if !permissionEndpointForbidden("POST", "/api/network/devices", eff) {
		t.Fatalf("network=ro should block network write API")
	}
}

func TestPrometheusReadQueriesAreAllowedForNonK8sFeatureModules(t *testing.T) {
	eff := effectivePermissionsFromJSON(DashboardRoleViewer, `{"k8s":"none","vcenter":"none","compute":"none","network":"ro","baota":"none","appcenter":"none"}`)
	if permissionEndpointForbidden("POST", "/api/prometheus/query", eff) {
		t.Fatalf("network=ro should allow POST /api/prometheus/query because it is a read query endpoint")
	}

	none := effectivePermissionsFromJSON(DashboardRoleViewer, `{"k8s":"none","vcenter":"none","compute":"none","network":"none","baota":"none","appcenter":"none"}`)
	if !permissionEndpointForbidden("POST", "/api/prometheus/query_range", none) {
		t.Fatalf("all modules none should block Prometheus read queries")
	}
}

func TestNetworkPrometheusScopeFallsBackToVCenterThenGlobal(t *testing.T) {
	cfg := Config{PrometheusURLVCenter: "https://prom-vcenter.example"}
	if got := GetPrometheusURLForScope(cfg, "network"); got != cfg.PrometheusURLVCenter {
		t.Fatalf("network scope = %q, want vCenter scoped URL", got)
	}

	cfg = Config{PrometheusURL: "https://prom-global.example"}
	if got := GetPrometheusURLForScope(cfg, "network"); got != cfg.PrometheusURL {
		t.Fatalf("network scope fallback = %q, want global URL", got)
	}
}
