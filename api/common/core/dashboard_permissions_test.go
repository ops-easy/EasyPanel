package core

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/gin-gonic/gin"
)

const dashboardPermissionTestDriverName = "kubebt_dashboard_permission_test"

var dashboardPermissionTestState = struct {
	sync.Mutex
	raw string
}{}

func init() {
	sql.Register(dashboardPermissionTestDriverName, dashboardPermissionTestDriver{})
}

type dashboardPermissionTestDriver struct{}

func (dashboardPermissionTestDriver) Open(string) (driver.Conn, error) {
	return dashboardPermissionTestConn{}, nil
}

type dashboardPermissionTestConn struct{}

func (dashboardPermissionTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("test driver does not support Prepare")
}

func (dashboardPermissionTestConn) Close() error {
	return nil
}

func (dashboardPermissionTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("test driver does not support transactions")
}

func (dashboardPermissionTestConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if !strings.Contains(query, "SELECT permissions_json FROM kubebt_dashboard_users") {
		return nil, errors.New("unexpected query")
	}
	dashboardPermissionTestState.Lock()
	raw := dashboardPermissionTestState.raw
	dashboardPermissionTestState.Unlock()
	return &dashboardPermissionRows{raw: raw}, nil
}

type dashboardPermissionRows struct {
	raw  string
	done bool
}

func (r *dashboardPermissionRows) Columns() []string {
	return []string{"permissions_json"}
}

func (r *dashboardPermissionRows) Close() error {
	return nil
}

func (r *dashboardPermissionRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	dest[0] = r.raw
	return nil
}

func setDashboardPermissionTestRaw(raw string) {
	dashboardPermissionTestState.Lock()
	defer dashboardPermissionTestState.Unlock()
	dashboardPermissionTestState.raw = raw
}

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

func TestAdminPermissionsPreserveMenuHidesWithoutReducingBackendAccess(t *testing.T) {
	setDashboardPermissionTestRaw(`{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"none","menu":{"appcenter":false,"docs":true}}`)
	db, err := sql.Open(dashboardPermissionTestDriverName, "")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer db.Close()

	eff := LoadEffectiveDashboardPermissions(db, "root", DashboardRoleAdmin)
	if eff.AppCenter != ModuleAccessRW || eff.K8s != ModuleAccessRW || eff.Compute != ModuleAccessRW {
		t.Fatalf("admin module access = k8s:%q compute:%q appcenter:%q, want all rw", eff.K8s, eff.Compute, eff.AppCenter)
	}
	if eff.Menu["appcenter"] != false {
		t.Fatalf("admin menu appcenter hide was not preserved: %#v", eff.Menu)
	}
	if eff.Menu["docs"] != true {
		t.Fatalf("admin menu docs allow was not preserved: %#v", eff.Menu)
	}

	public := EffectivePermissionsToPublic(eff)
	menu, ok := public["menu"].(map[string]bool)
	if !ok {
		t.Fatalf("public menu type = %T, want map[string]bool", public["menu"])
	}
	if menu["appcenter"] != false || menu["docs"] != true {
		t.Fatalf("public menu = %#v", menu)
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

func TestPermissionMatrixCoversKeyModules(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		method string
		path   string
		want   bool
	}{
		{
			name:   "k8s ro allows summary read",
			raw:    `{"k8s":"ro","compute":"none","network":"none","baota":"none","appcenter":"none"}`,
			method: http.MethodGet,
			path:   "/api/k8s/summary",
			want:   false,
		},
		{
			name:   "k8s ro blocks yaml apply",
			raw:    `{"k8s":"ro","compute":"none","network":"none","baota":"none","appcenter":"none"}`,
			method: http.MethodPost,
			path:   "/api/k8s/apply-yaml",
			want:   true,
		},
		{
			name:   "compute ro allows vcenter read",
			raw:    `{"k8s":"none","compute":"ro","network":"none","baota":"none","appcenter":"none"}`,
			method: http.MethodGet,
			path:   "/api/vcenter/vms",
			want:   false,
		},
		{
			name:   "compute ro blocks vcenter power write",
			raw:    `{"k8s":"none","compute":"ro","network":"none","baota":"none","appcenter":"none"}`,
			method: http.MethodPost,
			path:   "/api/vcenter/vms/vm-101/power",
			want:   true,
		},
		{
			name:   "network ro allows device read",
			raw:    `{"k8s":"none","compute":"none","network":"ro","baota":"none","appcenter":"none"}`,
			method: http.MethodGet,
			path:   "/api/network/devices",
			want:   false,
		},
		{
			name:   "network ro blocks device write",
			raw:    `{"k8s":"none","compute":"none","network":"ro","baota":"none","appcenter":"none"}`,
			method: http.MethodPost,
			path:   "/api/network/devices",
			want:   true,
		},
		{
			name:   "baota ro allows status read",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"ro","appcenter":"none"}`,
			method: http.MethodGet,
			path:   "/api/baota/ingress-sync/status",
			want:   false,
		},
		{
			name:   "baota ro blocks sync run",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"ro","appcenter":"none"}`,
			method: http.MethodPost,
			path:   "/api/baota/ingress-sync/run",
			want:   true,
		},
		{
			name:   "appcenter none blocks app status read",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"none"}`,
			method: http.MethodGet,
			path:   "/api/app-center/redis/status",
			want:   true,
		},
		{
			name:   "redis readonly blocks writes",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"rw","appcenterRedis":"readonly"}`,
			method: http.MethodPost,
			path:   "/api/app-center/redis/k8s-deploy",
			want:   true,
		},
		{
			name:   "mysql inherits redis scope unless explicitly set",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"rw","appcenterRedis":"readonly"}`,
			method: http.MethodPost,
			path:   "/api/app-center/mysql/k8s-deploy",
			want:   true,
		},
		{
			name:   "mysql can be full while redis is readonly",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"rw","appcenterRedis":"readonly","appcenterMysql":"full"}`,
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances/1/backups",
			want:   false,
		},
		{
			name:   "cloud vm managed only blocks create",
			raw:    `{"k8s":"none","compute":"none","network":"none","baota":"none","appcenter":"rw","appcenterRedis":"full","appcenterCloudVm":"managed_only"}`,
			method: http.MethodPost,
			path:   "/api/app-center/cloud-vm/instances",
			want:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			eff := effectivePermissionsFromJSON(DashboardRoleViewer, tt.raw)
			if got := permissionEndpointForbidden(tt.method, tt.path, eff); got != tt.want {
				t.Fatalf("permissionEndpointForbidden(%s, %s) = %v, want %v", tt.method, tt.path, got, tt.want)
			}
		})
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

func TestPrometheusQueryScopeVisibilityFollowsOwningModule(t *testing.T) {
	eff := effectivePermissionsFromJSON(DashboardRoleViewer, `{"k8s":"none","vcenter":"none","compute":"none","network":"ro","baota":"none","appcenter":"none"}`)

	if prometheusScopeForbidden("network", eff) {
		t.Fatalf("network=ro should allow Prometheus network scope")
	}
	if !prometheusScopeForbidden("vcenter", eff) {
		t.Fatalf("compute=none should block Prometheus vCenter scope")
	}
	if !prometheusScopeForbidden("k8s", eff) {
		t.Fatalf("k8s=none should block Prometheus k8s scope")
	}
}

func TestPrometheusQueryHandlerRejectsScopeWithoutModulePermission(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	app := &ServerApp{}
	eff := effectivePermissionsFromJSON(DashboardRoleViewer, `{"k8s":"none","vcenter":"none","compute":"none","network":"ro","baota":"none","appcenter":"none"}`)
	r.POST("/api/prometheus/query", func(c *gin.Context) {
		SetDashboardPermissionsGin(c, eff)
		handlePrometheusQuery(c, app)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/prometheus/query", strings.NewReader(`{"scope":"vcenter","q":"up"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("POST /api/prometheus/query scope=vcenter status=%d, want %d; body=%s", w.Code, http.StatusForbidden, w.Body.String())
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

func TestPVEPrometheusScopeHasDedicatedConfigAndFallback(t *testing.T) {
	cfg := Config{
		PrometheusURL:        "https://prom-global.example",
		PrometheusURLVCenter: "https://prom-vcenter.example",
	}
	setStringField(t, &cfg, "PrometheusURLPVE", "https://prom-pve.example")

	if got := GetPrometheusURLForScope(cfg, "pve"); got != "https://prom-pve.example" {
		t.Fatalf("pve scope = %q, want dedicated PVE URL", got)
	}

	cfg = Config{
		PrometheusURL:        "https://prom-global.example",
		PrometheusURLVCenter: "https://prom-vcenter.example",
	}
	setStringField(t, &cfg, "VMSelectURLPVE", "https://vmselect-pve.example")
	setStringField(t, &cfg, "PrometheusURLPVE", "https://prom-pve.example")

	if got := GetPrometheusURLForScope(cfg, "proxmox"); got != "https://vmselect-pve.example" {
		t.Fatalf("proxmox scope = %q, want PVE vmselect to take precedence", got)
	}

	cfg = Config{PrometheusURL: "https://prom-global.example"}
	if got := GetPrometheusURLForScope(cfg, "pve"); got != cfg.PrometheusURL {
		t.Fatalf("pve scope fallback = %q, want global URL", got)
	}
}

func TestPVEPrometheusRuntimeSettingsFieldsExist(t *testing.T) {
	cfgType := reflect.TypeOf(Config{})
	for _, name := range []string{"PrometheusURLPVE", "VMSelectURLPVE"} {
		if _, ok := cfgType.FieldByName(name); !ok {
			t.Fatalf("Config missing %s", name)
		}
	}

	rsType := reflect.TypeOf(RuntimeSettings{})
	for _, name := range []string{"PrometheusURLPVE", "VMSelectURLPVE"} {
		if _, ok := rsType.FieldByName(name); !ok {
			t.Fatalf("RuntimeSettings missing %s", name)
		}
	}
}

func setStringField(t *testing.T, ptr any, name, value string) {
	t.Helper()
	v := reflect.ValueOf(ptr).Elem()
	f := v.FieldByName(name)
	if !f.IsValid() {
		t.Fatalf("%T missing field %s", ptr, name)
	}
	f.SetString(value)
}
