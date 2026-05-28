package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestAppMySQLStoredConfigEncryptsPassword(t *testing.T) {
	const plain = "root-secret-password"
	cfg := Config{EncryptionKey: "test-encryption-key"}

	st, err := buildAppMySQLStoredConfigFromRequest(cfg, map[string]interface{}{
		"mode":          "external",
		"host":          "mysql.example.internal",
		"port":          float64(3307),
		"username":      "root",
		"password":      plain,
		"defaultSchema": "appdb",
		"tlsMode":       "preferred",
	})
	if err != nil {
		t.Fatalf("buildAppMySQLStoredConfigFromRequest returned error: %v", err)
	}
	if st.Mode != AppMySQLExternal {
		t.Fatalf("mode=%q, want external", st.Mode)
	}
	if st.Host != "mysql.example.internal" || st.Port != 3307 || st.Username != "root" {
		t.Fatalf("unexpected endpoint: %+v", st)
	}
	if st.PasswordEnc == "" {
		t.Fatalf("PasswordEnc is empty")
	}
	if st.PasswordEnc == plain {
		t.Fatalf("PasswordEnc contains plaintext")
	}

	raw, err := json.Marshal(st)
	if err != nil {
		t.Fatalf("marshal stored config: %v", err)
	}
	if strings.Contains(string(raw), plain) {
		t.Fatalf("stored config leaks plaintext password: %s", raw)
	}
}

func TestAppMySQLPublicSummaryMasksSensitiveFields(t *testing.T) {
	st := &appMySQLStoredConfig{
		Mode:          AppMySQLExternal,
		Host:          "mysql.example.internal",
		Port:          3306,
		Username:      "root",
		PasswordEnc:   "encrypted-value",
		DefaultSchema: "appdb",
		TLSMode:       "preferred",
	}

	summary := appMySQLPublicSummary(st)
	if summary["hasPassword"] != true {
		t.Fatalf("hasPassword=%v, want true", summary["hasPassword"])
	}
	if _, ok := summary["passwordEnc"]; ok {
		t.Fatalf("summary must not expose passwordEnc: %#v", summary)
	}
	if _, ok := summary["password"]; ok {
		t.Fatalf("summary must not expose password: %#v", summary)
	}
	if summary["host"] != "mysql.example.internal" || summary["port"] != 3306 {
		t.Fatalf("summary endpoint mismatch: %#v", summary)
	}
}

func TestRegisterMySQLRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api := r.Group("/api")
	RegisterMySQLRoutes(api, nil)

	got := map[string]bool{}
	for _, route := range r.Routes() {
		got[route.Method+" "+route.Path] = true
	}
	for _, want := range []string{
		"GET /api/app-center/mysql/status",
		"GET /api/app-center/mysql/instances",
		"POST /api/app-center/mysql/instances",
		"POST /api/app-center/mysql/instances/:id/ping",
		"GET /api/app-center/mysql/instances/:id/runtime",
		"GET /api/app-center/mysql/instances/:id/schemas",
		"GET /api/app-center/mysql/instances/:id/tables",
		"GET /api/app-center/mysql/instances/:id/processlist",
		"GET /api/app-center/mysql/instances/:id/users",
		"POST /api/app-center/mysql/instances/:id/users",
		"PUT /api/app-center/mysql/instances/:id/users/:user/password",
		"DELETE /api/app-center/mysql/instances/:id/users/:user",
		"GET /api/app-center/mysql/instances/:id/backups",
		"POST /api/app-center/mysql/instances/:id/backups",
		"POST /api/app-center/mysql/instances/:id/backups/:backupId/restore",
		"DELETE /api/app-center/mysql/instances/:id/backups/:backupId",
		"POST /api/app-center/mysql/instances/:id/query",
		"GET /api/app-center/mysql/instances/:id/mysql-cli/ws",
		"GET /api/app-center/mysql/instances/:id/k8s-status",
		"GET /api/app-center/mysql/instances/:id/k8s-network",
		"POST /api/app-center/mysql/k8s-deploy",
		"GET /api/app-center/mysql/templates",
		"POST /api/app-center/mysql/templates",
	} {
		if !got[want] {
			t.Fatalf("route %s is not registered", want)
		}
	}
}

func TestBuildAppMySQLCliInnerShellUsesEnvPassword(t *testing.T) {
	cmd := buildAppMySQLCliInnerShell(&appMySQLStoredConfig{DefaultSchema: "orders"})
	if strings.Contains(cmd, "-p") || strings.Contains(cmd, "root-secret") {
		t.Fatalf("mysql cli command must not expose plaintext password args: %s", cmd)
	}
	if !strings.Contains(cmd, "MYSQL_PWD") {
		t.Fatalf("mysql cli command should use container password env: %s", cmd)
	}
	if !strings.Contains(cmd, "--database='orders'") {
		t.Fatalf("mysql cli command should select default schema safely: %s", cmd)
	}
}

func TestAppMySQLCLIModeAllowsExternalInstances(t *testing.T) {
	st := &appMySQLStoredConfig{
		Mode:     AppMySQLExternal,
		Host:     "mysql.example.internal",
		Port:     3306,
		Username: "root",
	}
	if got := appMySQLResolveCLIMode(st); got != appMySQLCLIModeDirect {
		t.Fatalf("appMySQLResolveCLIMode()=%q, want %q", got, appMySQLCLIModeDirect)
	}
}

func TestFormatMySQLCLITableIncludesRows(t *testing.T) {
	got := formatMySQLCLITable([]string{"id", "name"}, [][]string{{"1", "orders"}})
	for _, want := range []string{
		"+----+--------+",
		"| id | name   |",
		"| 1  | orders |",
		"1 row in set",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("formatted table missing %q:\n%s", want, got)
		}
	}
}

func TestAppMySQLBackupCommandsProtectSystemSchemas(t *testing.T) {
	for _, schema := range []string{"mysql", "information_schema", "sys", "bad;name"} {
		if _, err := appMySQLBuildBackupCommand(schema, "backup.sql"); err == nil {
			t.Fatalf("backup command accepted schema %q", schema)
		}
	}
	cmd, err := appMySQLBuildBackupCommand("orders", "orders.sql")
	if err != nil {
		t.Fatalf("build backup command: %v", err)
	}
	joined := strings.Join(cmd, " ")
	if strings.Contains(joined, "root-secret") {
		t.Fatalf("backup command must not embed plaintext password: %s", joined)
	}
	if !strings.Contains(joined, "MYSQL_ROOT_PASSWORD") {
		t.Fatalf("backup command should use container password env: %s", joined)
	}
}

func TestAppMySQLUserSQLQuoting(t *testing.T) {
	got := appMySQLUserPrincipal("app'user", "%")
	if got != "'app''user'@'%'" {
		t.Fatalf("principal=%s", got)
	}
	if err := appMySQLValidateAccountUser("bad\nuser"); err == nil {
		t.Fatalf("expected newline username to be rejected")
	}
}

func TestAppMySQLK8sResourceBuildersCreateCompleteStack(t *testing.T) {
	opts := AppMySQLK8sDeployOpts{
		Namespace:          "data",
		BaseName:           "orders-mysql",
		Version:            "8.0",
		RootPassword:       "root-secret",
		Database:           "orders",
		AppUsername:        "orders_app",
		AppPassword:        "app-secret",
		PodPort:            3306,
		SvcPort:            3306,
		EnableExporter:     true,
		PersistenceEnabled: true,
		StorageSize:        "8Gi",
		MySQLImage:         "mysql:8.0.36",
		ExporterImage:      "prom/mysqld-exporter:v0.15.1",
	}
	secret := buildAppMySQLAuthSecret(opts)
	if secret == nil || secret.Name != "orders-mysql-auth" || secret.StringData["rootPassword"] == "" {
		t.Fatalf("invalid auth secret: %#v", secret)
	}
	pvc, err := buildAppMySQLDataPVC(opts, "")
	if err != nil {
		t.Fatalf("buildAppMySQLDataPVC returned error: %v", err)
	}
	if pvc.Name != "orders-mysql-data" {
		t.Fatalf("pvc name=%q", pvc.Name)
	}
	dep := buildAppMySQLDeployment(Config{}, opts, pvc.Name)
	if len(dep.Spec.Template.Spec.Containers) != 2 {
		t.Fatalf("containers=%d, want mysql + exporter", len(dep.Spec.Template.Spec.Containers))
	}
	mysql := dep.Spec.Template.Spec.Containers[0]
	assertAppMySQLQuantity(t, mysql.Resources.Requests, corev1.ResourceCPU, "250m")
	assertAppMySQLQuantity(t, mysql.Resources.Requests, corev1.ResourceMemory, "512Mi")
	assertAppMySQLQuantity(t, mysql.Resources.Limits, corev1.ResourceCPU, "1")
	assertAppMySQLQuantity(t, mysql.Resources.Limits, corev1.ResourceMemory, "1Gi")
	svc := buildAppMySQLService(opts)
	if len(svc.Spec.Ports) != 2 {
		t.Fatalf("service ports=%d, want mysql + metrics", len(svc.Spec.Ports))
	}
}

func TestAppMySQLMainContainerAllowsResourceOverrides(t *testing.T) {
	container := appMySQLMainContainer(AppMySQLK8sDeployOpts{
		BaseName:           "orders-mysql",
		MySQLCPURequest:    "750m",
		MySQLCPULimit:      "2",
		MySQLMemoryRequest: "1Gi",
		MySQLMemoryLimit:   "3Gi",
	}, "mysql:8.0")
	assertAppMySQLQuantity(t, container.Resources.Requests, corev1.ResourceCPU, "750m")
	assertAppMySQLQuantity(t, container.Resources.Requests, corev1.ResourceMemory, "1Gi")
	assertAppMySQLQuantity(t, container.Resources.Limits, corev1.ResourceCPU, "2")
	assertAppMySQLQuantity(t, container.Resources.Limits, corev1.ResourceMemory, "3Gi")
}

func TestAppMySQLQueryGuardRejectsMutationsByDefault(t *testing.T) {
	for _, sql := range []string{
		"delete from users",
		"insert into t values (1)",
		"update t set x=1",
		"drop table t",
		"select 1; delete from users",
	} {
		if appMySQLQueryAllowedWithoutMutationConfirm(sql) {
			t.Fatalf("query %q should require mutation confirmation", sql)
		}
	}
	for _, sql := range []string{
		"select * from users",
		"show processlist",
		"describe users",
		"explain select * from users",
	} {
		if !appMySQLQueryAllowedWithoutMutationConfirm(sql) {
			t.Fatalf("query %q should be allowed", sql)
		}
	}
}

func TestAppMySQLQuoteIdentifierEscapesBackticks(t *testing.T) {
	got, err := appMySQLQuoteIdentifier("team`orders")
	if err != nil {
		t.Fatal(err)
	}
	if got != "`team``orders`" {
		t.Fatalf("got %q", got)
	}
	if _, err := appMySQLQuoteIdentifier(" "); err == nil {
		t.Fatal("empty identifier should be rejected")
	}
}

func assertAppMySQLQuantity(t *testing.T, got corev1.ResourceList, name corev1.ResourceName, want string) {
	t.Helper()
	q, ok := got[name]
	if !ok {
		t.Fatalf("missing resource %s in %#v", name, got)
	}
	w := resource.MustParse(want)
	if q.Cmp(w) != 0 {
		t.Fatalf("resource %s=%s, want %s", name, q.String(), w.String())
	}
}
