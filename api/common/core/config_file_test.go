package core

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

func TestLoadConfigReadsAutoOpsStyleConfigFile(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  address: 0.0.0.0:18080
  publicUrl: https://kubebt.example.com
  serveFrontend: true
db:
  dialects: mysql
  host: db.example.internal
  port: 3307
  db: kube_bt_sync
  username: kubebt
  password: db-secret
  charset: utf8mb4
redis:
  address: redis.example.internal:6380
  password: redis-secret
  db: 2
startup:
  schedulers:
    enabled: false
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)

	cfg := LoadConfig()

	if cfg.DashboardListenAddr != "0.0.0.0:18080" {
		t.Fatalf("DashboardListenAddr = %q", cfg.DashboardListenAddr)
	}
	if cfg.PlatformPublicURL != "https://kubebt.example.com" {
		t.Fatalf("PlatformPublicURL = %q", cfg.PlatformPublicURL)
	}
	if !cfg.ServeFrontend {
		t.Fatalf("ServeFrontend = false, want true")
	}
	if cfg.MySQLHost != "db.example.internal" || cfg.MySQLPort != 3307 ||
		cfg.MySQLDatabase != "kube_bt_sync" || cfg.MySQLUser != "kubebt" ||
		cfg.MySQLPassword != "db-secret" {
		t.Fatalf("MySQL fields not loaded: %#v", cfg)
	}
	if !strings.Contains(cfg.MySQLDSN, "kubebt:db-secret@tcp(db.example.internal:3307)/kube_bt_sync") {
		t.Fatalf("MySQLDSN = %q", cfg.MySQLDSN)
	}
	if cfg.RedisAddr != "redis.example.internal:6380" || cfg.RedisPassword != "redis-secret" || cfg.RedisDB != 2 {
		t.Fatalf("Redis config not loaded: addr=%q password=%q db=%d", cfg.RedisAddr, cfg.RedisPassword, cfg.RedisDB)
	}
	if cfg.EnableBackgroundJobs {
		t.Fatalf("EnableBackgroundJobs = true, want false")
	}
}

func TestLoadConfigKeepsEnvironmentOverridesAboveConfigFile(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  address: 0.0.0.0:18080
db:
  host: db.from.file
  port: 3306
  db: from_file
  username: file_user
  password: file-secret
redis:
  address: redis.from.file:6379
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)
	t.Setenv("DASHBOARD_HTTP_ADDR", ":19090")
	t.Setenv("MYSQL_HOST", "db.from.env")
	t.Setenv("REDIS_ADDR", "redis.from.env:6379")

	cfg := LoadConfig()

	if cfg.DashboardListenAddr != ":19090" {
		t.Fatalf("DashboardListenAddr = %q", cfg.DashboardListenAddr)
	}
	if cfg.MySQLHost != "db.from.env" {
		t.Fatalf("MySQLHost = %q", cfg.MySQLHost)
	}
	if cfg.RedisAddr != "redis.from.env:6379" {
		t.Fatalf("RedisAddr = %q", cfg.RedisAddr)
	}
}

func TestLoadConfigReadsBusinessConfigSections(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
app:
  version: 1
  initialized: true
baota:
  url: https://bt.example.com
  apiKey: baota-secret
  skipTlsVerify: true
  disableHttpKeepalive: true
  httpTimeoutSec: 55
  tcpProbeTimeoutSec: 6
  checkMinIntervalSec: 77
  targets:
    - id: default
      name: 默认宝塔
      url: https://bt-a.example.com
      apiKey: target-secret
      default: true
  upstream:
    host: upstream.example.com
    port: "18080"
    scheme: https
  ssl:
    certName: example-cert
    pemPath: /certs/tls.crt
    keyPath: /certs/tls.key
sync:
  intervalSec: 45
  ddnsHost: ddns.example.com
  defaultPort: "30080"
platform:
  publicUrl: https://kubebt.example.com
  displayName: Kube BT
  assetsCdnBaseUrl: https://cdn.example.com/kubebt/
oidc:
  issuerUrl: https://idp.example.com
  clientId: kubebt
  clientSecret: oidc-secret
  redirectUrl: https://kubebt.example.com/callback
  scopes: openid profile email groups
  skipIssuerCheck: true
  skipClientIdCheck: true
  supportedSigningAlgs: RS256,ES256
  clockSkewSec: 60
prometheus:
  urlK8s: https://prom-k8s.example.com
  timeoutSec: 42
  skipTls: true
victoriaMetrics:
  vmSelectUrlCloud: https://vm-cloud.example.com
victoriaLogs:
  url: https://vl.example.com
  vectorDownloadBaseUrl: https://assets.example.com/vector
  geoLite2CountryMmdb: /data/GeoLite2-Country.mmdb
harbor:
  baseUrl: https://harbor.example.com/
  username: harbor-user
  password: harbor-secret
  skipTls: true
vcenter:
  url: https://vcenter.example.com
  user: vc-user
  password: vc-secret
  vmSshPort: 2222
  cacheTtlSec: 321
ssh:
  settingsBackend: file
  encryptionKey: 1234567890abcdef
  settingsDir: /data/ssh-vm
redis:
  address: redis.full.example.com:6380
  password: redis-secret
  db: 3
  k8s:
    persistence: false
    storageSize: 20Gi
    storageClass: fast
db:
  host: mysql.full.example.com
  port: 3307
  db: kubebt_full
  username: kubebt_user
  password: mysql-secret
ingress:
  baotaSyncEnabled: true
  nginxManifestUrl: https://manifests.example.com/ingress.yaml
  nginxHostHttpsPort: 8443
k8sAddons:
  manifestMirror: direct
idrac:
  host: idrac.example.com
  user: idrac-user
  password: idrac-secret
  insecure: true
k8s:
  mode: kubeconfig
  kubeconfigYaml: "apiVersion: v1"
  sidebarMenu:
    - key: pods
      label: 工作负载
      hidden: true
      order: 99
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)

	cfg := LoadConfig()

	if cfg.BaotaURL != "https://bt-a.example.com" || cfg.BaotaAPIKey != "target-secret" {
		t.Fatalf("baota config not loaded: %#v", cfg)
	}
	if cfg.DDNSHost != "ddns.example.com" || cfg.DefaultPort != "30080" {
		t.Fatalf("sync config not loaded: %#v", cfg)
	}
	if cfg.PlatformDisplayName != "Kube BT" || cfg.AssetsCDNBaseURL != "https://cdn.example.com/kubebt" {
		t.Fatalf("platform config not loaded: %#v", cfg)
	}
	if cfg.OIDCIssuerURL != "https://idp.example.com" || cfg.OIDCClockSkewSec != 60 {
		t.Fatalf("oidc config not loaded: %#v", cfg)
	}
	if cfg.PrometheusURLK8s != "https://prom-k8s.example.com" || cfg.VMSelectURLCloud != "https://vm-cloud.example.com" {
		t.Fatalf("monitor config not loaded: %#v", cfg)
	}
	if cfg.VMLogVectorDownloadBaseURL != "https://assets.example.com/vector" || cfg.HarborBaseURL != "https://harbor.example.com" {
		t.Fatalf("ops config not loaded: %#v", cfg)
	}
	if cfg.VCenterURL != "https://vcenter.example.com" || cfg.VCenterVMSshPort != 2222 {
		t.Fatalf("vcenter config not loaded: %#v", cfg)
	}
	if cfg.RedisK8sStorageClass != "fast" || cfg.RedisK8sPersistenceEnabled {
		t.Fatalf("redis k8s config not loaded: %#v", cfg)
	}
	if cfg.MySQLHost != "mysql.full.example.com" || cfg.MySQLDatabase != "kubebt_full" {
		t.Fatalf("mysql config not loaded: %#v", cfg)
	}
	if !cfg.IngressBaotaSyncEnabled || cfg.IngressNginxHostHTTPSPort != 8443 {
		t.Fatalf("ingress config not loaded: %#v", cfg)
	}
	if cfg.IdracHost != "idrac.example.com" || !cfg.IdracInsecure {
		t.Fatalf("idrac config not loaded: %#v", cfg)
	}
	if cfg.configFileRuntime == nil {
		t.Fatalf("configFileRuntime is nil")
	}
	if cfg.configFileRuntime.K8s == nil || cfg.configFileRuntime.K8s.Mode != "kubeconfig" {
		t.Fatalf("k8s runtime config not loaded: %#v", cfg.configFileRuntime.K8s)
	}
	if len(cfg.configFileRuntime.K8sSidebarMenu) != 1 || cfg.configFileRuntime.K8sSidebarMenu[0].Order != 99 {
		t.Fatalf("sidebar runtime config not loaded: %#v", cfg.configFileRuntime.K8sSidebarMenu)
	}
}

func TestLoadConfigReadsRuntimeCompatibleSection(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
runtime:
  initialized: true
  baotaUrl: https://bt.example.com
  baotaApiKey: baota-secret
  baotaTargets:
    - id: default
      name: 默认宝塔
      url: https://bt-a.example.com
      apiKey: target-secret
      default: true
  baotaSkipTlsVerify: true
  baotaDisableHttpKeepalive: true
  baotaHttpTimeoutSec: 55
  baotaTcpProbeTimeoutSec: 6
  baotaCheckMinIntervalSec: 77
  ddnsHost: ddns.example.com
  defaultPort: "30080"
  baotaUpstreamHost: upstream.example.com
  baotaUpstreamPort: "18080"
  baotaUpstreamScheme: https
  baotaSslCertName: example-cert
  baotaSslPemPath: /certs/tls.crt
  baotaSslKeyPath: /certs/tls.key
  syncIntervalSec: 45
  dashboardUser: root
  dashboardPassword: dashboard-secret
  dashboardSessionSecret: session-secret
  dashboardSessionDays: 15
  dashboardCookieSecure: true
  dashboardListenAddr: "0.0.0.0:18888"
  oidcIssuerUrl: https://idp.example.com
  oidcClientId: kubebt
  oidcClientSecret: oidc-secret
  oidcRedirectUrl: https://kubebt.example.com/callback
  oidcScopes: openid profile email groups
  oidcSkipIssuerCheck: true
  oidcSkipClientIdCheck: true
  oidcSupportedSigningAlgs: RS256,ES256
  oidcClockSkewSec: 60
  prometheusUrl: https://prom.example.com
  prometheusUrlK8s: https://prom-k8s.example.com
  prometheusUrlVcenter: https://prom-vc.example.com
  prometheusUrlCloud: https://prom-cloud.example.com
  prometheusTimeoutSec: 42
  prometheusSkipTls: true
  prometheusBearerToken: prom-token
  vmSelectUrlK8s: https://vm-k8s.example.com
  vmSelectUrlVcenter: https://vm-vc.example.com
  vmSelectUrlCloud: https://vm-cloud.example.com
  victoriaLogsUrl: https://vl.example.com
  vmLogVectorDownloadBaseUrl: https://assets.example.com/vector
  victoriaLogsRetentionDays: 99
  geoLite2CountryMmdb: /data/GeoLite2-Country.mmdb
  harborBaseUrl: https://harbor.example.com/
  harborUsername: harbor-user
  harborPassword: harbor-secret
  harborSkipTls: true
  vcenterUrl: https://vcenter.example.com
  vcenterUser: vc-user
  vcenterPassword: vc-secret
  vcenterInsecure: true
  vcenterWmksScriptUrl: https://cdn.example.com/wmks.js
  vcenterWmksCssUrl: https://cdn.example.com/wmks.css
  vcenterUiBaseUrl: https://vcenter-ui.example.com
  vcenterConsoleHost: console.example.com
  vcenterUiThumbprint: thumbprint
  vcenterVmSshUser: root
  vcenterVmSshPrivateKeyPath: /keys/id_rsa
  vcenterVmSshPassword: vm-secret
  vcenterVmSshKeyPassphrase: key-pass
  vcenterVmSshPort: 2222
  vcenterVmSshInsecureHostKey: true
  sshSettingsBackend: file
  encryptionKey: 1234567890abcdef
  redisAddr: "redis.full.example.com:6380"
  redisPassword: redis-secret
  redisDb: 3
  redisKeyPrefix: "kubebt:"
  redisMode: sentinel
  redisHost: redis-host.example.com
  redisPort: 6381
  redisSentinelMaster: mymaster
  redisImageRegistry: harbor.example.com/redis
  redisExporterImageRegistry: harbor.example.com/exporters
  redisImagePullSecret: pull-secret
  redisEngineImages:
    "7": "harbor.example.com/redis:7"
  redisExporterImage: "harbor.example.com/redis-exporter:latest"
  redisK8sPersistence: false
  redisK8sStorageSize: 20Gi
  redisK8sStorageClass: fast
  mysqlHost: mysql.full.example.com
  mysqlPort: 3307
  mysqlDatabase: kubebt_full
  mysqlUser: kubebt_user
  mysqlPassword: mysql-secret
  sshSettingsDir: /data/ssh-vm
  platformPublicUrl: https://kubebt.example.com
  platformDisplayName: Kube BT
  platformLogoUrl: /logo.png
  platformFaviconUrl: /favicon.ico
  assetsCdnBaseUrl: https://cdn.example.com/kubebt/
  sshTerminalFontFamily: JetBrains Mono
  sshTerminalFontSize: 16
  ingressBaotaSyncEnabled: true
  ingressNginxManifestUrl: https://manifests.example.com/ingress.yaml
  ingressNginxHostHttpPort: 8080
  ingressNginxHostHttpsPort: 8443
  ingressNginxControllerNodeName: node-a
  k8sAddonsManifestMirror: direct
  vcenterCacheTtlSec: 321
  idracHost: idrac.example.com
  idracUser: idrac-user
  idracPassword: idrac-secret
  idracInsecure: true
  k8sSidebarMenu:
    - key: pods
      label: 工作负载
      hidden: true
      order: 99
  k8s:
    mode: kubeconfig
    kubeconfigYaml: "apiVersion: v1"
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)

	cfg := LoadConfig()

	if cfg.BaotaURL != "https://bt-a.example.com" || cfg.BaotaAPIKey != "target-secret" {
		t.Fatalf("baota config not loaded: %#v", cfg)
	}
	if len(cfg.BaotaTargets) != 1 || cfg.BaotaTargets[0].URL != "https://bt-a.example.com" {
		t.Fatalf("baota targets not loaded: %#v", cfg.BaotaTargets)
	}
	if cfg.DashboardListenAddr != "0.0.0.0:18888" || cfg.DashboardUser != "root" {
		t.Fatalf("dashboard config not loaded: %#v", cfg)
	}
	if cfg.OIDCIssuerURL != "https://idp.example.com" || cfg.OIDCClockSkewSec != 60 {
		t.Fatalf("oidc config not loaded: %#v", cfg)
	}
	if cfg.PrometheusURLK8s != "https://prom-k8s.example.com" || cfg.VMSelectURLCloud != "https://vm-cloud.example.com" {
		t.Fatalf("monitor config not loaded: %#v", cfg)
	}
	if cfg.VMLogVectorDownloadBaseURL != "https://assets.example.com/vector" || cfg.HarborBaseURL != "https://harbor.example.com" {
		t.Fatalf("ops config not loaded: %#v", cfg)
	}
	if cfg.VCenterURL != "https://vcenter.example.com" || cfg.VCenterVMSshPort != 2222 {
		t.Fatalf("vcenter config not loaded: %#v", cfg)
	}
	if cfg.RedisImageRegistry != "harbor.example.com/redis" || cfg.RedisK8sStorageClass != "fast" || cfg.RedisK8sPersistenceEnabled {
		t.Fatalf("redis image config not loaded: %#v", cfg)
	}
	if cfg.MySQLHost != "mysql.full.example.com" || cfg.MySQLDatabase != "kubebt_full" {
		t.Fatalf("mysql config not loaded: %#v", cfg)
	}
	if cfg.PlatformDisplayName != "Kube BT" || cfg.AssetsCDNBaseURL != "https://cdn.example.com/kubebt" {
		t.Fatalf("platform config not loaded: %#v", cfg)
	}
	if !cfg.IngressBaotaSyncEnabled || cfg.IngressNginxHostHTTPSPort != 8443 {
		t.Fatalf("ingress config not loaded: %#v", cfg)
	}
	if cfg.IdracHost != "idrac.example.com" || !cfg.IdracInsecure {
		t.Fatalf("idrac config not loaded: %#v", cfg)
	}
	if cfg.configFileRuntime == nil {
		t.Fatalf("configFileRuntime is nil")
	}
	if cfg.configFileRuntime.K8s == nil || cfg.configFileRuntime.K8s.Mode != "kubeconfig" {
		t.Fatalf("k8s runtime config not loaded: %#v", cfg.configFileRuntime.K8s)
	}
	if len(cfg.configFileRuntime.K8sSidebarMenu) != 1 || cfg.configFileRuntime.K8sSidebarMenu[0].Order != 99 {
		t.Fatalf("sidebar runtime config not loaded: %#v", cfg.configFileRuntime.K8sSidebarMenu)
	}
}

func TestNewServerAppIgnoresRuntimeConfigFile(t *testing.T) {
	clearConfigEnv(t)
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  publicUrl: https://from-config.example.com
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "runtime-config.json"), []byte(`{
  "version": 1,
  "initialized": true,
  "platformPublicUrl": "https://from-runtime.example.com"
}`), 0600); err != nil {
		t.Fatalf("write runtime file: %v", err)
	}

	app, err := NewServerApp(dataDir)
	if err != nil {
		t.Fatalf("NewServerApp: %v", err)
	}

	if !app.Initialized() {
		t.Fatalf("app is not initialized")
	}
	if got := app.Cfg().PlatformPublicURL; got != "https://from-config.example.com" {
		t.Fatalf("PlatformPublicURL = %q", got)
	}
}

func TestStructuredConfigMappingsCoverRuntimeSettingsFields(t *testing.T) {
	mapped := make(map[string]struct{})
	for _, m := range structuredRuntimeFieldMappings() {
		mapped[m.key] = struct{}{}
	}
	var missing []string
	for key := range runtimeSettingsJSONKeys() {
		if _, ok := mapped[key]; !ok {
			missing = append(missing, key)
		}
	}
	if len(missing) > 0 {
		sort.Strings(missing)
		t.Fatalf("structured config mapping missing fields: %s", strings.Join(missing, ", "))
	}
}

func TestDefaultConfigContainsOnlyBootstrapSections(t *testing.T) {
	raw, err := os.ReadFile(filepath.Clean("../../config.yaml"))
	if err != nil {
		t.Fatalf("read default config: %v", err)
	}
	top, err := configYAMLObject(raw)
	if err != nil {
		t.Fatalf("parse default config: %v", err)
	}

	var missingBootstrap []string
	for _, key := range []string{"server", "db", "redis", "startup", "performance"} {
		if _, ok := top[key]; !ok {
			missingBootstrap = append(missingBootstrap, key)
		}
	}
	if len(missingBootstrap) > 0 {
		sort.Strings(missingBootstrap)
		t.Fatalf("default config missing bootstrap sections: %s", strings.Join(missingBootstrap, ", "))
	}

	var dynamicSections []string
	for _, key := range []string{
		"app",
		"baota",
		"sync",
		"platform",
		"terminal",
		"oidc",
		"prometheus",
		"victoriaMetrics",
		"victoriaLogs",
		"harbor",
		"vcenter",
		"ssh",
		"ingress",
		"k8sAddons",
		"k8s",
		"idrac",
		"cloudHost",
		"nodeExporter",
		"cos",
	} {
		if _, ok := top[key]; ok {
			dynamicSections = append(dynamicSections, key)
		}
	}
	if len(dynamicSections) > 0 {
		sort.Strings(dynamicSections)
		t.Fatalf("default config should not include dynamic sections: %s", strings.Join(dynamicSections, ", "))
	}

	var unusedFields []string
	for _, path := range [][]string{
		{"db", "dialects"},
		{"db", "charset"},
	} {
		if _, ok := lookupConfigPath(top, path...); ok {
			unusedFields = append(unusedFields, strings.Join(path, "."))
		}
	}
	if len(unusedFields) > 0 {
		sort.Strings(unusedFields)
		t.Fatalf("default config should not include unused fields: %s", strings.Join(unusedFields, ", "))
	}
}

func TestMySQLDynamicConfigYAMLOverlaysStaticConfig(t *testing.T) {
	clearConfigEnv(t)
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config.yaml")
	if err := os.WriteFile(configPath, []byte(`
server:
  publicUrl: https://static.example.com
db:
  host: mysql.static.example.com
  port: 3306
  db: kubebt_static
  username: static_user
  password: static-db-secret
redis:
  address: redis.static.example.com:6379
`), 0600); err != nil {
		t.Fatalf("write config file: %v", err)
	}
	rs := &RuntimeSettings{
		Version:                 1,
		Initialized:             true,
		BaotaURL:                "https://bt.dynamic.example.com",
		BaotaAPIKey:             "dynamic-baota-secret",
		DDNSHost:                "dynamic.example.com",
		DefaultPort:             "30443",
		DashboardUser:           "dynamic-admin",
		DashboardSessionDays:    9,
		DashboardListenAddr:     "0.0.0.0:18080",
		MySQLHost:               "mysql.dynamic.example.com",
		MySQLPort:               3308,
		MySQLDatabase:           "kubebt_dynamic",
		MySQLUser:               "dynamic_user",
		MySQLPassword:           "dynamic-db-secret",
		RedisAddr:               "redis.dynamic.example.com:6380",
		RedisPassword:           "dynamic-redis-secret",
		RedisDB:                 4,
		PlatformPublicURL:       "https://dynamic.example.com",
		OIDCIssuerURL:           "https://idp.dynamic.example.com",
		OIDCClientID:            "dynamic-client",
		OIDCClientSecret:        "dynamic-oidc-secret",
		OIDCRedirectURL:         "https://dynamic.example.com/callback",
		PrometheusURLK8s:        "https://prom.dynamic.example.com",
		HarborBaseURL:           "https://harbor.dynamic.example.com",
		HarborUsername:          "harbor-dynamic",
		HarborPassword:          "harbor-secret",
		VCenterURL:              "https://vc.dynamic.example.com",
		VCenterUser:             "vc-dynamic",
		VCenterPassword:         "vc-secret",
		SSHSettingsBackend:      "file",
		EncryptionKey:           "1234567890abcdef",
		SSHSettingsDir:          "/data/ssh-dynamic",
		K8sAddonsManifestMirror: "direct",
		K8s: &RuntimeK8s{
			Mode:           "kubeconfig",
			KubeconfigYAML: "apiVersion: v1",
		},
	}
	dynamicRaw, err := RuntimeSettingsToConfigYAML(rs)
	if err != nil {
		t.Fatalf("render dynamic config yaml: %v", err)
	}
	t.Setenv("KUBEBT_CONFIG_FILE", configPath)

	cfg := LoadConfig()
	applyConfigYAMLBytes(&cfg, dynamicRaw, "MySQL 动态配置")
	finalizeLoadedConfig(&cfg)

	if cfg.BaotaURL != "https://bt.dynamic.example.com" || cfg.BaotaAPIKey != "dynamic-baota-secret" {
		t.Fatalf("baota dynamic config not loaded: %#v", cfg)
	}
	if cfg.MySQLHost != "mysql.static.example.com" || cfg.MySQLDatabase != "kubebt_static" {
		t.Fatalf("mysql bootstrap config should stay static: %#v", cfg)
	}
	if cfg.RedisAddr != "redis.dynamic.example.com:6380" || cfg.RedisDB != 4 {
		t.Fatalf("redis dynamic config not loaded: %#v", cfg)
	}
	if cfg.configFileRuntime == nil || cfg.configFileRuntime.K8s == nil || cfg.configFileRuntime.K8s.Mode != "kubeconfig" {
		t.Fatalf("k8s dynamic config not loaded: %#v", cfg.configFileRuntime)
	}
}

func TestMySQLDynamicConfigYAMLSkipsEnvironmentAndBootstrapDBFields(t *testing.T) {
	clearConfigEnv(t)
	t.Setenv("MYSQL_PASSWORD", "env-db-secret")
	rs := &RuntimeSettings{
		Version:           1,
		Initialized:       true,
		DashboardUser:     "admin",
		DashboardPassword: "initial-secret",
		MySQLHost:         "mysql.dynamic.example.com",
		MySQLPort:         3306,
		MySQLDatabase:     "kubebt",
		MySQLUser:         "kubebt",
		MySQLPassword:     "env-db-secret",
	}

	raw, err := RuntimeSettingsToConfigYAML(rs)
	if err != nil {
		t.Fatalf("render dynamic config yaml: %v", err)
	}
	if strings.Contains(string(raw), "env-db-secret") {
		t.Fatalf("dynamic config persisted environment-managed secret:\n%s", string(raw))
	}
	if strings.Contains(string(raw), "mysql.dynamic.example.com") || strings.Contains(string(raw), "kubebt") {
		t.Fatalf("dynamic config persisted MySQL bootstrap fields:\n%s", string(raw))
	}
	if strings.Contains(string(raw), "initial-secret") || strings.Contains(string(raw), "dashboard") {
		t.Fatalf("dynamic config persisted dashboard account fields:\n%s", string(raw))
	}
}

func clearConfigEnv(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"KUBEBT_CONFIG_FILE",
		"DASHBOARD_HTTP_ADDR",
		"PLATFORM_PUBLIC_URL",
		"DASHBOARD_SERVE_FRONTEND",
		"MYSQL_DSN",
		"MYSQL_HOST",
		"MYSQL_PORT",
		"MYSQL_DATABASE",
		"MYSQL_USER",
		"MYSQL_PASSWORD",
		"REDIS_ADDR",
		"REDIS_PASSWORD",
		"REDIS_DB",
		"REDIS_HOST",
		"REDIS_PORT",
		"KUBEBT_ENABLE_BACKGROUND_JOBS",
	} {
		key := key
		old, had := os.LookupEnv(key)
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unset %s: %v", key, err)
		}
		t.Cleanup(func() {
			if had {
				_ = os.Setenv(key, old)
			} else {
				_ = os.Unsetenv(key)
			}
		})
	}
}
