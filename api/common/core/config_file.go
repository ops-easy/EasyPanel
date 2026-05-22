package core

import (
	"encoding/json"
	"log"
	"os"
	"reflect"
	"strings"

	"gopkg.in/yaml.v3"
	sigyaml "sigs.k8s.io/yaml"
)

const (
	configFileEnv = "KUBEBT_CONFIG_FILE"
)

type yamlConfig struct {
	Server       yamlServer       `yaml:"server"`
	DB           yamlDB           `yaml:"db"`
	Redis        yamlRedis        `yaml:"redis"`
	Startup      yamlStartup      `yaml:"startup"`
	Performance  yamlPerformance  `yaml:"performance"`
	VictoriaLogs yamlVictoriaLogs `yaml:"victoriaLogs"`
	Ingress      yamlIngress      `yaml:"ingress"`
	VCenter      yamlVCenter      `yaml:"vcenter"`
	CloudHost    yamlCloudHost    `yaml:"cloudHost"`
	NodeExporter yamlNodeExporter `yaml:"nodeExporter"`
	COS          yamlCOS          `yaml:"cos"`
}

type yamlServer struct {
	Address        string  `yaml:"address"`
	Model          string  `yaml:"model"`
	PublicURL      string  `yaml:"publicUrl"`
	User           string  `yaml:"user"`
	Password       *string `yaml:"password"`
	SessionSecret  string  `yaml:"sessionSecret"`
	SessionDays    int     `yaml:"sessionDays"`
	CookieSecure   *bool   `yaml:"cookieSecure"`
	AccessLog      *bool   `yaml:"accessLog"`
	ServeFrontend  *bool   `yaml:"serveFrontend"`
	TrustedProxies string  `yaml:"trustedProxies"`
	TotpIssuer     string  `yaml:"totpIssuer"`
	DisplayName    string  `yaml:"displayName"`
	LogoURL        string  `yaml:"logoUrl"`
	FaviconURL     string  `yaml:"faviconUrl"`
}

type yamlDB struct {
	DSN      string `yaml:"dsn"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Database string `yaml:"database"`
	DB       string `yaml:"db"`
	Username string `yaml:"username"`
	User     string `yaml:"user"`
	Password string `yaml:"password"`
}

type yamlRedis struct {
	Address        string `yaml:"address"`
	Host           string `yaml:"host"`
	Port           int    `yaml:"port"`
	Password       string `yaml:"password"`
	DB             *int   `yaml:"db"`
	KeyPrefix      string `yaml:"keyPrefix"`
	Mode           string `yaml:"mode"`
	SentinelMaster string `yaml:"sentinelMaster"`
}

type yamlStartup struct {
	Schedulers yamlSchedulers `yaml:"schedulers"`
}

type yamlSchedulers struct {
	Enabled *bool `yaml:"enabled"`
}

type yamlPerformance struct {
	Mode               string `yaml:"mode"`
	NamespacesCacheTTL int    `yaml:"namespacesCacheTtlSec"`
}

type yamlVictoriaLogs struct {
	SkipTLS *bool `yaml:"skipTls"`
}

type yamlIngress struct {
	NginxSkipK8sRegistryMirror *bool  `yaml:"nginxSkipK8sRegistryMirror"`
	NginxK8sImageMirrorPrefix  string `yaml:"nginxK8sImageMirrorPrefix"`
}

type yamlVCenter struct {
	BastionVMListCacheTTLSec int `yaml:"bastionVmListCacheTtlSec"`
}

type yamlCloudHost struct {
	AutoInstallNodeExporter *bool `yaml:"autoInstallNodeExporter"`
}

type yamlNodeExporter struct {
	Version string `yaml:"version"`
}

type yamlCOS struct {
	SecretID   string `yaml:"secretId"`
	SecretKey  string `yaml:"secretKey"`
	Bucket     string `yaml:"bucket"`
	Region     string `yaml:"region"`
	Prefix     string `yaml:"prefix"`
	PublicBase string `yaml:"publicBase"`
}

func applyConfigFile(cfg *Config) {
	path, explicit := configFilePath()
	applyConfigFilePath(cfg, path, explicit)
}

func applyConfigFilePath(cfg *Config, path string, explicit bool) {
	if cfg == nil {
		return
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if explicit || !os.IsNotExist(err) {
			log.Printf("config: 读取 %s 失败: %v", path, err)
		}
		return
	}
	applyConfigYAMLBytes(cfg, raw, path)
}

// applyConfigYAMLBytes 将静态 config.yaml 或 MySQL 动态配置中的 YAML 应用到 Config。
func applyConfigYAMLBytes(cfg *Config, raw []byte, label string) {
	if cfg == nil {
		return
	}
	var yc yamlConfig
	if err := yaml.Unmarshal(raw, &yc); err != nil {
		log.Printf("config: 解析 %s 失败: %v", label, err)
		return
	}
	yc.apply(cfg)
	rs, ok, err := structuredRuntimeSettingsFromConfigYAML(raw, RuntimeSettingsFromConfig(*cfg))
	if err != nil {
		log.Printf("config: 解析 %s 的业务配置段失败: %v", label, err)
	}
	if compat, compatOK, err := runtimeSettingsFromConfigYAML(raw); err != nil {
		log.Printf("config: 解析 %s 的 runtime 段失败: %v", label, err)
	} else if compatOK {
		rs, ok = compat, true
	}
	if ok {
		rs.Initialized = true
		merged := MergeRuntimeConfig(*cfg, rs, "")
		merged.configFileRuntime = rs
		*cfg = merged
	}
}

func configFilePath() (string, bool) {
	if p := strings.TrimSpace(os.Getenv(configFileEnv)); p != "" {
		return p, true
	}
	return "./config.yaml", false
}

func (yc yamlConfig) apply(cfg *Config) {
	if envUnset("DASHBOARD_HTTP_ADDR") && strings.TrimSpace(yc.Server.Address) != "" {
		cfg.DashboardListenAddr = normalizeDashboardListenAddr(yc.Server.Address)
	}
	if envUnset("PLATFORM_PUBLIC_URL") && strings.TrimSpace(yc.Server.PublicURL) != "" {
		cfg.PlatformPublicURL = strings.TrimSpace(yc.Server.PublicURL)
	}
	if envUnset("DASHBOARD_USER") && strings.TrimSpace(yc.Server.User) != "" {
		cfg.DashboardUser = strings.TrimSpace(yc.Server.User)
	}
	if envUnset("DASHBOARD_PASSWORD") && yc.Server.Password != nil {
		if password := strings.TrimSpace(*yc.Server.Password); password != "" {
			cfg.DashboardPassword = password
		}
	}
	if envUnset("DASHBOARD_SESSION_SECRET") && strings.TrimSpace(yc.Server.SessionSecret) != "" {
		cfg.DashboardSessionSecret = strings.TrimSpace(yc.Server.SessionSecret)
	}
	if envUnset("DASHBOARD_SESSION_DAYS") && yc.Server.SessionDays > 0 {
		cfg.DashboardSessionDays = yc.Server.SessionDays
	}
	if envUnset("DASHBOARD_COOKIE_SECURE") && yc.Server.CookieSecure != nil {
		cfg.DashboardCookieSecure = *yc.Server.CookieSecure
	}
	if envUnset("DASHBOARD_ACCESS_LOG") && yc.Server.AccessLog != nil {
		cfg.DashboardAccessLog = *yc.Server.AccessLog
	}
	if envUnset("DASHBOARD_SERVE_FRONTEND") && yc.Server.ServeFrontend != nil {
		cfg.ServeFrontend = *yc.Server.ServeFrontend
	}
	if envUnset("DASHBOARD_TRUSTED_PROXIES") && strings.TrimSpace(yc.Server.TrustedProxies) != "" {
		cfg.DashboardTrustedProxies = strings.TrimSpace(yc.Server.TrustedProxies)
	}
	if envUnset("KUBEBT_TOTP_ISSUER") && strings.TrimSpace(yc.Server.TotpIssuer) != "" {
		cfg.TotpIssuer = strings.TrimSpace(yc.Server.TotpIssuer)
	}
	if envUnset("PLATFORM_DISPLAY_NAME") && strings.TrimSpace(yc.Server.DisplayName) != "" {
		cfg.PlatformDisplayName = strings.TrimSpace(yc.Server.DisplayName)
	}
	if envUnset("PLATFORM_LOGO_URL") && strings.TrimSpace(yc.Server.LogoURL) != "" {
		cfg.PlatformLogoURL = strings.TrimSpace(yc.Server.LogoURL)
	}
	if envUnset("PLATFORM_FAVICON_URL") && strings.TrimSpace(yc.Server.FaviconURL) != "" {
		cfg.PlatformFaviconURL = strings.TrimSpace(yc.Server.FaviconURL)
	}
	if envUnset("KUBEBT_PERFORMANCE_MODE") {
		model := strings.ToLower(strings.TrimSpace(firstConfigValue(yc.Performance.Mode, yc.Server.Model)))
		if model == "release" || model == "true" || model == "on" {
			cfg.PerformanceMode = true
		} else if model == "debug" || model == "false" || model == "off" {
			cfg.PerformanceMode = false
		}
	}
	if envUnset("KUBEBT_NAMESPACES_CACHE_TTL_SEC") && yc.Performance.NamespacesCacheTTL > 0 {
		cfg.NamespacesCacheTTLSec = yc.Performance.NamespacesCacheTTL
	}
	if envUnset("MYSQL_DSN") && strings.TrimSpace(yc.DB.DSN) != "" {
		cfg.MySQLDSN = strings.TrimSpace(yc.DB.DSN)
	}
	if envUnset("MYSQL_HOST") && strings.TrimSpace(yc.DB.Host) != "" {
		cfg.MySQLHost = strings.TrimSpace(yc.DB.Host)
	}
	if envUnset("MYSQL_PORT") && yc.DB.Port > 0 {
		cfg.MySQLPort = yc.DB.Port
	}
	if envUnset("MYSQL_DATABASE") {
		if db := strings.TrimSpace(firstConfigValue(yc.DB.Database, yc.DB.DB)); db != "" {
			cfg.MySQLDatabase = db
		}
	}
	if envUnset("MYSQL_USER") {
		if user := strings.TrimSpace(firstConfigValue(yc.DB.Username, yc.DB.User)); user != "" {
			cfg.MySQLUser = user
		}
	}
	if envUnset("MYSQL_PASSWORD") && yc.DB.Password != "" {
		cfg.MySQLPassword = yc.DB.Password
	}
	if envUnset("REDIS_ADDR") && strings.TrimSpace(yc.Redis.Address) != "" {
		cfg.RedisAddr = strings.TrimSpace(yc.Redis.Address)
	}
	if envUnset("REDIS_HOST") && strings.TrimSpace(yc.Redis.Host) != "" {
		cfg.RedisHost = strings.TrimSpace(yc.Redis.Host)
	}
	if envUnset("REDIS_PORT") && yc.Redis.Port > 0 {
		cfg.RedisPort = yc.Redis.Port
	}
	if envUnset("REDIS_PASSWORD") && yc.Redis.Password != "" {
		cfg.RedisPassword = yc.Redis.Password
	}
	if envUnset("REDIS_DB") && yc.Redis.DB != nil {
		cfg.RedisDB = *yc.Redis.DB
	}
	if envUnset("REDIS_SSH_KEY_PREFIX") && strings.TrimSpace(yc.Redis.KeyPrefix) != "" {
		cfg.RedisKeyPrefix = strings.TrimSpace(yc.Redis.KeyPrefix)
	}
	if envUnset("REDIS_MODE") && strings.TrimSpace(yc.Redis.Mode) != "" {
		cfg.RedisMode = strings.ToLower(strings.TrimSpace(yc.Redis.Mode))
	}
	if envUnset("REDIS_SENTINEL_MASTER") && strings.TrimSpace(yc.Redis.SentinelMaster) != "" {
		cfg.RedisSentinelMaster = strings.TrimSpace(yc.Redis.SentinelMaster)
	}
	if envUnset("KUBEBT_ENABLE_BACKGROUND_JOBS") && yc.Startup.Schedulers.Enabled != nil {
		cfg.EnableBackgroundJobs = *yc.Startup.Schedulers.Enabled
	}
	if envUnset("VICTORIA_LOGS_SKIP_TLS_VERIFY") && yc.VictoriaLogs.SkipTLS != nil {
		cfg.VictoriaLogsSkipTLS = *yc.VictoriaLogs.SkipTLS
	}
	if envUnset("INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR") && yc.Ingress.NginxSkipK8sRegistryMirror != nil {
		cfg.IngressNginxSkipK8sRegistryMirror = *yc.Ingress.NginxSkipK8sRegistryMirror
	}
	if envUnset("INGRESS_NGINX_K8S_IMAGE_MIRROR_PREFIX") && strings.TrimSpace(yc.Ingress.NginxK8sImageMirrorPrefix) != "" {
		cfg.IngressNginxK8sImageMirrorPrefix = strings.TrimSpace(yc.Ingress.NginxK8sImageMirrorPrefix)
	}
	if envUnset("VCENTER_BASTION_VM_LIST_CACHE_TTL_SEC") && yc.VCenter.BastionVMListCacheTTLSec > 0 {
		cfg.VCenterBastionVMListCacheTTLSec = yc.VCenter.BastionVMListCacheTTLSec
	}
	if envUnset("CLOUD_HOST_AUTO_INSTALL_NODE_EXPORTER") && yc.CloudHost.AutoInstallNodeExporter != nil {
		cfg.CloudHostAutoInstallNodeExporter = *yc.CloudHost.AutoInstallNodeExporter
	}
	if envUnset("NODE_EXPORTER_VERSION") && strings.TrimSpace(yc.NodeExporter.Version) != "" {
		cfg.NodeExporterVersion = strings.TrimSpace(yc.NodeExporter.Version)
	}
	if envUnset("KUBEBT_COS_SECRET_ID") && strings.TrimSpace(yc.COS.SecretID) != "" {
		cfg.CosSecretID = strings.TrimSpace(yc.COS.SecretID)
	}
	if envUnset("KUBEBT_COS_SECRET_KEY") && yc.COS.SecretKey != "" {
		cfg.CosSecretKey = yc.COS.SecretKey
	}
	if envUnset("KUBEBT_COS_BUCKET") && strings.TrimSpace(yc.COS.Bucket) != "" {
		cfg.CosBucket = strings.TrimSpace(yc.COS.Bucket)
	}
	if envUnset("KUBEBT_COS_REGION") && strings.TrimSpace(yc.COS.Region) != "" {
		cfg.CosRegion = strings.TrimSpace(yc.COS.Region)
	}
	if envUnset("KUBEBT_COS_PREFIX") && strings.TrimSpace(yc.COS.Prefix) != "" {
		cfg.CosPrefix = strings.Trim(strings.TrimSpace(yc.COS.Prefix), "/")
	}
	if envUnset("KUBEBT_COS_PUBLIC_BASE") && strings.TrimSpace(yc.COS.PublicBase) != "" {
		cfg.CosPublicBase = strings.TrimRight(strings.TrimSpace(yc.COS.PublicBase), "/")
	}
}

func envUnset(key string) bool {
	_, ok := os.LookupEnv(key)
	return !ok
}

func firstConfigValue(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

type structuredRuntimeMapping struct {
	key   string
	paths [][]string
}

func structuredRuntimeSettingsFromConfigYAML(raw []byte, base *RuntimeSettings) (*RuntimeSettings, bool, error) {
	top, err := configYAMLObject(raw)
	if err != nil {
		return nil, false, err
	}
	if !hasStructuredRuntimeConfig(top) {
		return nil, false, nil
	}
	out := runtimeSettingsMap(base)
	found := false
	for _, m := range structuredRuntimeFieldMappings() {
		if runtimeFieldEnvSet(m.key) {
			continue
		}
		for _, path := range m.paths {
			if v, ok := lookupConfigPath(top, path...); ok {
				out[m.key] = v
				found = true
				break
			}
		}
	}
	if !found {
		return nil, false, nil
	}
	if _, ok := out["version"]; !ok {
		out["version"] = 1
	}
	out["initialized"] = true
	b, err := json.Marshal(out)
	if err != nil {
		return nil, false, err
	}
	var rs RuntimeSettings
	if err := json.Unmarshal(b, &rs); err != nil {
		return nil, false, err
	}
	return &rs, true, nil
}

func runtimeSettingsMap(base *RuntimeSettings) map[string]interface{} {
	if base == nil {
		return make(map[string]interface{})
	}
	b, err := json.Marshal(base)
	if err != nil {
		return make(map[string]interface{})
	}
	var out map[string]interface{}
	if err := json.Unmarshal(b, &out); err != nil || out == nil {
		return make(map[string]interface{})
	}
	return out
}

func configYAMLObject(raw []byte) (map[string]interface{}, error) {
	jsonBytes, err := sigyaml.YAMLToJSON(raw)
	if err != nil {
		return nil, err
	}
	var top map[string]interface{}
	if err := json.Unmarshal(jsonBytes, &top); err != nil {
		return nil, err
	}
	return top, nil
}

func lookupConfigPath(top map[string]interface{}, path ...string) (interface{}, bool) {
	var cur interface{} = top
	for _, part := range path {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return nil, false
		}
		v, ok := m[part]
		if !ok {
			return nil, false
		}
		cur = v
	}
	return cur, true
}

func hasStructuredRuntimeConfig(top map[string]interface{}) bool {
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
	} {
		if _, ok := top[key]; ok {
			return true
		}
	}
	return false
}

func hasBusinessConfigSection(top map[string]json.RawMessage) bool {
	for _, key := range []string{
		"app",
		"server",
		"db",
		"redis",
		"startup",
		"performance",
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
		"idrac",
		"cloudHost",
		"nodeExporter",
		"cos",
	} {
		if _, ok := top[key]; ok {
			return true
		}
	}
	return false
}

func runtimeFieldEnvSet(key string) bool {
	envs := map[string][]string{
		"baotaUrl":                       {"BAOTA_URL"},
		"baotaApiKey":                    {"BAOTA_API_KEY"},
		"baotaSkipTlsVerify":             {"BAOTA_SKIP_TLS_VERIFY"},
		"baotaDisableHttpKeepalive":      {"BAOTA_DISABLE_HTTP_KEEPALIVE"},
		"baotaHttpTimeoutSec":            {"BAOTA_HTTP_TIMEOUT_SEC"},
		"baotaTcpProbeTimeoutSec":        {"BAOTA_TCP_PROBE_TIMEOUT_SEC"},
		"baotaCheckMinIntervalSec":       {"BAOTA_CHECK_MIN_INTERVAL_SEC"},
		"ddnsHost":                       {"DDNS_HOST"},
		"defaultPort":                    {"DEFAULT_PORT"},
		"baotaUpstreamHost":              {"BAOTA_UPSTREAM_HOST"},
		"baotaUpstreamPort":              {"BAOTA_UPSTREAM_PORT"},
		"baotaUpstreamScheme":            {"BAOTA_UPSTREAM_SCHEME"},
		"baotaSslCertName":               {"BAOTA_SSL_CERT_NAME"},
		"baotaSslPemPath":                {"BAOTA_SSL_PEM_PATH"},
		"baotaSslKeyPath":                {"BAOTA_SSL_KEY_PATH"},
		"syncIntervalSec":                {"SYNC_INTERVAL_SEC"},
		"dashboardUser":                  {"DASHBOARD_USER"},
		"dashboardPassword":              {"DASHBOARD_PASSWORD"},
		"dashboardSessionSecret":         {"DASHBOARD_SESSION_SECRET"},
		"dashboardSessionDays":           {"DASHBOARD_SESSION_DAYS"},
		"dashboardCookieSecure":          {"DASHBOARD_COOKIE_SECURE"},
		"dashboardListenAddr":            {"DASHBOARD_HTTP_ADDR"},
		"oidcIssuerUrl":                  {"OIDC_ISSUER_URL"},
		"oidcClientId":                   {"OIDC_CLIENT_ID"},
		"oidcClientSecret":               {"OIDC_CLIENT_SECRET"},
		"oidcRedirectUrl":                {"OIDC_REDIRECT_URL"},
		"oidcScopes":                     {"OIDC_SCOPES"},
		"oidcSkipIssuerCheck":            {"OIDC_SKIP_ISSUER_CHECK"},
		"oidcSkipClientIdCheck":          {"OIDC_SKIP_CLIENT_ID_CHECK"},
		"oidcSupportedSigningAlgs":       {"OIDC_SUPPORTED_SIGNING_ALGS"},
		"oidcClockSkewSec":               {"OIDC_CLOCK_SKEW_SEC"},
		"prometheusUrl":                  {"PROMETHEUS_URL"},
		"prometheusUrlK8s":               {"PROMETHEUS_URL_K8S"},
		"prometheusUrlVcenter":           {"PROMETHEUS_URL_VCENTER"},
		"prometheusUrlPve":               {"PROMETHEUS_URL_PVE"},
		"prometheusUrlCloud":             {"PROMETHEUS_URL_CLOUD"},
		"prometheusTimeoutSec":           {"PROMETHEUS_HTTP_TIMEOUT_SEC"},
		"prometheusSkipTls":              {"PROMETHEUS_SKIP_TLS_VERIFY"},
		"prometheusBearerToken":          {"PROMETHEUS_BEARER_TOKEN"},
		"vmSelectUrlK8s":                 {"VM_SELECT_URL_K8S"},
		"vmSelectUrlVcenter":             {"VM_SELECT_URL_VCENTER"},
		"vmSelectUrlPve":                 {"VM_SELECT_URL_PVE"},
		"vmSelectUrlCloud":               {"VM_SELECT_URL_CLOUD"},
		"victoriaLogsUrl":                {"VICTORIA_LOGS_URL"},
		"vmLogVectorDownloadBaseUrl":     {"KUBEBT_VMLOG_VECTOR_DOWNLOAD_BASE_URL"},
		"geoLite2CountryMmdb":            {"KUBEBT_GEOLITE2_COUNTRY_MMDB"},
		"harborBaseUrl":                  {"HARBOR_BASE_URL"},
		"harborUsername":                 {"HARBOR_USERNAME"},
		"harborPassword":                 {"HARBOR_PASSWORD"},
		"harborSkipTls":                  {"HARBOR_SKIP_TLS"},
		"vcenterUrl":                     {"VCENTER_URL"},
		"vcenterUser":                    {"VCENTER_USER"},
		"vcenterPassword":                {"VCENTER_PASSWORD"},
		"vcenterInsecure":                {"VCENTER_INSECURE"},
		"vcenterWmksScriptUrl":           {"VCENTER_WMKS_SCRIPT_URL"},
		"vcenterWmksCssUrl":              {"VCENTER_WMKS_CSS_URL"},
		"vcenterUiBaseUrl":               {"VCENTER_UI_BASE_URL"},
		"vcenterConsoleHost":             {"VCENTER_CONSOLE_HOST"},
		"vcenterUiThumbprint":            {"VCENTER_UI_THUMBPRINT"},
		"vcenterVmSshUser":               {"VCENTER_VM_SSH_USER"},
		"vcenterVmSshPrivateKeyPath":     {"VCENTER_VM_SSH_PRIVATE_KEY_PATH"},
		"vcenterVmSshPassword":           {"VCENTER_VM_SSH_PASSWORD"},
		"vcenterVmSshKeyPassphrase":      {"VCENTER_VM_SSH_KEY_PASSPHRASE"},
		"vcenterVmSshPort":               {"VCENTER_VM_SSH_PORT"},
		"vcenterVmSshInsecureHostKey":    {"VCENTER_VM_SSH_INSECURE_HOST_KEY"},
		"sshSettingsBackend":             {"SSH_SETTINGS_BACKEND"},
		"encryptionKey":                  {"KUBEBT_ENCRYPTION_KEY"},
		"redisAddr":                      {"REDIS_ADDR"},
		"redisPassword":                  {"REDIS_PASSWORD"},
		"redisDb":                        {"REDIS_DB"},
		"redisKeyPrefix":                 {"REDIS_SSH_KEY_PREFIX"},
		"redisMode":                      {"REDIS_MODE"},
		"redisHost":                      {"REDIS_HOST"},
		"redisPort":                      {"REDIS_PORT"},
		"redisSentinelMaster":            {"REDIS_SENTINEL_MASTER"},
		"redisImageRegistry":             {"REDIS_IMAGE_REGISTRY"},
		"redisExporterImageRegistry":     {"REDIS_EXPORTER_IMAGE_REGISTRY"},
		"redisImagePullSecret":           {"REDIS_IMAGE_PULL_SECRET"},
		"redisEngineImages":              {"REDIS_ENGINE_IMAGES_JSON"},
		"redisExporterImage":             {"REDIS_EXPORTER_IMAGE"},
		"redisK8sPersistence":            {"REDIS_K8S_PERSISTENCE_ENABLED"},
		"redisK8sStorageSize":            {"REDIS_K8S_STORAGE_SIZE"},
		"redisK8sStorageClass":           {"REDIS_K8S_STORAGE_CLASS"},
		"mysqlDsn":                       {"MYSQL_DSN"},
		"mysqlHost":                      {"MYSQL_HOST"},
		"mysqlPort":                      {"MYSQL_PORT"},
		"mysqlDatabase":                  {"MYSQL_DATABASE"},
		"mysqlUser":                      {"MYSQL_USER"},
		"mysqlPassword":                  {"MYSQL_PASSWORD"},
		"sshSettingsDir":                 {"SSH_SETTINGS_DIR"},
		"platformPublicUrl":              {"PLATFORM_PUBLIC_URL"},
		"platformDisplayName":            {"PLATFORM_DISPLAY_NAME"},
		"platformLogoUrl":                {"PLATFORM_LOGO_URL"},
		"platformFaviconUrl":             {"PLATFORM_FAVICON_URL"},
		"assetsCdnBaseUrl":               {"KUBEBT_ASSETS_CDN_BASE"},
		"sshTerminalFontFamily":          {"KUBEBT_SSH_TERMINAL_FONT_FAMILY"},
		"sshTerminalFontSize":            {"KUBEBT_SSH_TERMINAL_FONT_SIZE"},
		"ingressBaotaSyncEnabled":        {"INGRESS_BAOTA_SYNC_ENABLED"},
		"ingressNginxManifestUrl":        {"INGRESS_NGINX_MANIFEST_URL"},
		"ingressNginxHostHttpPort":       {"INGRESS_NGINX_HOST_HTTP_PORT"},
		"ingressNginxHostHttpsPort":      {"INGRESS_NGINX_HOST_HTTPS_PORT"},
		"ingressNginxControllerNodeName": {"INGRESS_NGINX_CONTROLLER_NODE"},
		"k8sAddonsManifestMirror":        {"KUBEBT_K8S_ADDONS_MANIFEST_MIRROR"},
		"vcenterCacheTtlSec":             {"VCENTER_CACHE_TTL_SEC"},
		"idracHost":                      {"IDRAC_HOST"},
		"idracUser":                      {"IDRAC_USER"},
		"idracPassword":                  {"IDRAC_PASSWORD"},
		"idracInsecure":                  {"IDRAC_INSECURE"},
	}
	for _, env := range envs[key] {
		if !envUnset(env) {
			return true
		}
	}
	return false
}

func structuredRuntimeFieldMappings() []structuredRuntimeMapping {
	return []structuredRuntimeMapping{
		{key: "version", paths: [][]string{{"app", "version"}}},
		{key: "initialized", paths: [][]string{{"app", "initialized"}}},
		{key: "baotaUrl", paths: [][]string{{"baota", "url"}}},
		{key: "baotaApiKey", paths: [][]string{{"baota", "apiKey"}}},
		{key: "baotaTargets", paths: [][]string{{"baota", "targets"}}},
		{key: "baotaSkipTlsVerify", paths: [][]string{{"baota", "skipTlsVerify"}}},
		{key: "baotaDisableHttpKeepalive", paths: [][]string{{"baota", "disableHttpKeepalive"}}},
		{key: "baotaHttpTimeoutSec", paths: [][]string{{"baota", "httpTimeoutSec"}}},
		{key: "baotaTcpProbeTimeoutSec", paths: [][]string{{"baota", "tcpProbeTimeoutSec"}}},
		{key: "baotaCheckMinIntervalSec", paths: [][]string{{"baota", "checkMinIntervalSec"}}},
		{key: "ddnsHost", paths: [][]string{{"sync", "ddnsHost"}}},
		{key: "defaultPort", paths: [][]string{{"sync", "defaultPort"}}},
		{key: "baotaUpstreamHost", paths: [][]string{{"baota", "upstream", "host"}}},
		{key: "baotaUpstreamPort", paths: [][]string{{"baota", "upstream", "port"}}},
		{key: "baotaUpstreamScheme", paths: [][]string{{"baota", "upstream", "scheme"}}},
		{key: "baotaSslCertName", paths: [][]string{{"baota", "ssl", "certName"}}},
		{key: "baotaSslPemPath", paths: [][]string{{"baota", "ssl", "pemPath"}}},
		{key: "baotaSslKeyPath", paths: [][]string{{"baota", "ssl", "keyPath"}}},
		{key: "baotaSslPemContent", paths: [][]string{{"baota", "ssl", "pemContent"}}},
		{key: "baotaSslKeyContent", paths: [][]string{{"baota", "ssl", "keyContent"}}},
		{key: "clearBaotaSslMaterial", paths: [][]string{{"baota", "ssl", "clearMaterial"}}},
		{key: "hasBaotaSslMaterial", paths: [][]string{{"baota", "ssl", "hasMaterial"}}},
		{key: "syncIntervalSec", paths: [][]string{{"sync", "intervalSec"}}},
		{key: "dashboardUser", paths: [][]string{{"server", "user"}}},
		{key: "dashboardPassword", paths: [][]string{{"server", "password"}}},
		{key: "dashboardSessionSecret", paths: [][]string{{"server", "sessionSecret"}}},
		{key: "dashboardSessionDays", paths: [][]string{{"server", "sessionDays"}}},
		{key: "dashboardCookieSecure", paths: [][]string{{"server", "cookieSecure"}}},
		{key: "dashboardListenAddr", paths: [][]string{{"server", "address"}}},
		{key: "oidcIssuerUrl", paths: [][]string{{"oidc", "issuerUrl"}}},
		{key: "oidcClientId", paths: [][]string{{"oidc", "clientId"}}},
		{key: "oidcClientSecret", paths: [][]string{{"oidc", "clientSecret"}}},
		{key: "oidcRedirectUrl", paths: [][]string{{"oidc", "redirectUrl"}}},
		{key: "oidcScopes", paths: [][]string{{"oidc", "scopes"}}},
		{key: "oidcSkipIssuerCheck", paths: [][]string{{"oidc", "skipIssuerCheck"}}},
		{key: "oidcSkipClientIdCheck", paths: [][]string{{"oidc", "skipClientIdCheck"}}},
		{key: "oidcSupportedSigningAlgs", paths: [][]string{{"oidc", "supportedSigningAlgs"}}},
		{key: "oidcClockSkewSec", paths: [][]string{{"oidc", "clockSkewSec"}}},
		{key: "prometheusUrl", paths: [][]string{{"prometheus", "url"}}},
		{key: "prometheusUrlK8s", paths: [][]string{{"prometheus", "urlK8s"}}},
		{key: "prometheusUrlVcenter", paths: [][]string{{"prometheus", "urlVcenter"}, {"prometheus", "urlVCenter"}}},
		{key: "prometheusUrlPve", paths: [][]string{{"prometheus", "urlPve"}, {"prometheus", "urlPVE"}, {"prometheus", "urlProxmox"}}},
		{key: "prometheusUrlCloud", paths: [][]string{{"prometheus", "urlCloud"}}},
		{key: "prometheusTimeoutSec", paths: [][]string{{"prometheus", "timeoutSec"}}},
		{key: "prometheusSkipTls", paths: [][]string{{"prometheus", "skipTls"}}},
		{key: "prometheusBearerToken", paths: [][]string{{"prometheus", "bearerToken"}}},
		{key: "vmSelectUrlK8s", paths: [][]string{{"victoriaMetrics", "vmSelectUrlK8s"}}},
		{key: "vmSelectUrlVcenter", paths: [][]string{{"victoriaMetrics", "vmSelectUrlVcenter"}, {"victoriaMetrics", "vmSelectUrlVCenter"}}},
		{key: "vmSelectUrlPve", paths: [][]string{{"victoriaMetrics", "vmSelectUrlPve"}, {"victoriaMetrics", "vmSelectUrlPVE"}, {"victoriaMetrics", "vmSelectUrlProxmox"}}},
		{key: "vmSelectUrlCloud", paths: [][]string{{"victoriaMetrics", "vmSelectUrlCloud"}}},
		{key: "victoriaLogsUrl", paths: [][]string{{"victoriaLogs", "url"}}},
		{key: "vmLogVectorDownloadBaseUrl", paths: [][]string{{"victoriaLogs", "vectorDownloadBaseUrl"}}},
		{key: "victoriaLogsRetentionDays", paths: [][]string{{"victoriaLogs", "retentionDays"}}},
		{key: "geoLite2CountryMmdb", paths: [][]string{{"victoriaLogs", "geoLite2CountryMmdb"}, {"geoip", "countryMmdb"}}},
		{key: "harborBaseUrl", paths: [][]string{{"harbor", "baseUrl"}}},
		{key: "harborUsername", paths: [][]string{{"harbor", "username"}}},
		{key: "harborPassword", paths: [][]string{{"harbor", "password"}}},
		{key: "harborSkipTls", paths: [][]string{{"harbor", "skipTls"}}},
		{key: "vcenterUrl", paths: [][]string{{"vcenter", "url"}}},
		{key: "vcenterUser", paths: [][]string{{"vcenter", "user"}}},
		{key: "vcenterPassword", paths: [][]string{{"vcenter", "password"}}},
		{key: "vcenterInsecure", paths: [][]string{{"vcenter", "insecure"}}},
		{key: "vcenterWmksScriptUrl", paths: [][]string{{"vcenter", "wmksScriptUrl"}}},
		{key: "vcenterWmksCssUrl", paths: [][]string{{"vcenter", "wmksCssUrl"}}},
		{key: "vcenterUiBaseUrl", paths: [][]string{{"vcenter", "uiBaseUrl"}}},
		{key: "vcenterConsoleHost", paths: [][]string{{"vcenter", "consoleHost"}}},
		{key: "vcenterUiThumbprint", paths: [][]string{{"vcenter", "uiThumbprint"}}},
		{key: "vcenterVmSshUser", paths: [][]string{{"vcenter", "vmSshUser"}}},
		{key: "vcenterVmSshPrivateKeyPath", paths: [][]string{{"vcenter", "vmSshPrivateKeyPath"}}},
		{key: "vcenterVmSshPassword", paths: [][]string{{"vcenter", "vmSshPassword"}}},
		{key: "vcenterVmSshKeyPassphrase", paths: [][]string{{"vcenter", "vmSshKeyPassphrase"}}},
		{key: "vcenterVmSshPort", paths: [][]string{{"vcenter", "vmSshPort"}}},
		{key: "vcenterVmSshInsecureHostKey", paths: [][]string{{"vcenter", "vmSshInsecureHostKey"}}},
		{key: "sshSettingsBackend", paths: [][]string{{"ssh", "settingsBackend"}}},
		{key: "encryptionKey", paths: [][]string{{"ssh", "encryptionKey"}}},
		{key: "redisAddr", paths: [][]string{{"redis", "address"}}},
		{key: "redisPassword", paths: [][]string{{"redis", "password"}}},
		{key: "redisDb", paths: [][]string{{"redis", "db"}}},
		{key: "redisKeyPrefix", paths: [][]string{{"redis", "keyPrefix"}}},
		{key: "redisMode", paths: [][]string{{"redis", "mode"}}},
		{key: "redisHost", paths: [][]string{{"redis", "host"}}},
		{key: "redisPort", paths: [][]string{{"redis", "port"}}},
		{key: "redisSentinelMaster", paths: [][]string{{"redis", "sentinelMaster"}}},
		{key: "redisImageRegistry", paths: [][]string{{"redis", "imageRegistry"}}},
		{key: "redisExporterImageRegistry", paths: [][]string{{"redis", "exporterImageRegistry"}}},
		{key: "redisImagePullSecret", paths: [][]string{{"redis", "imagePullSecret"}}},
		{key: "redisEngineImages", paths: [][]string{{"redis", "engineImages"}}},
		{key: "redisExporterImage", paths: [][]string{{"redis", "exporterImage"}}},
		{key: "redisK8sPersistence", paths: [][]string{{"redis", "k8s", "persistence"}}},
		{key: "redisK8sStorageSize", paths: [][]string{{"redis", "k8s", "storageSize"}}},
		{key: "redisK8sStorageClass", paths: [][]string{{"redis", "k8s", "storageClass"}}},
		{key: "mysqlDsn", paths: [][]string{{"db", "dsn"}}},
		{key: "mysqlHost", paths: [][]string{{"db", "host"}}},
		{key: "mysqlPort", paths: [][]string{{"db", "port"}}},
		{key: "mysqlDatabase", paths: [][]string{{"db", "db"}, {"db", "database"}}},
		{key: "mysqlUser", paths: [][]string{{"db", "username"}, {"db", "user"}}},
		{key: "mysqlPassword", paths: [][]string{{"db", "password"}}},
		{key: "sshSettingsDir", paths: [][]string{{"ssh", "settingsDir"}}},
		{key: "platformPublicUrl", paths: [][]string{{"platform", "publicUrl"}, {"server", "publicUrl"}}},
		{key: "platformDisplayName", paths: [][]string{{"platform", "displayName"}, {"server", "displayName"}}},
		{key: "platformLogoUrl", paths: [][]string{{"platform", "logoUrl"}, {"server", "logoUrl"}}},
		{key: "platformFaviconUrl", paths: [][]string{{"platform", "faviconUrl"}, {"server", "faviconUrl"}}},
		{key: "assetsCdnBaseUrl", paths: [][]string{{"platform", "assetsCdnBaseUrl"}}},
		{key: "sshTerminalFontFamily", paths: [][]string{{"terminal", "fontFamily"}, {"ssh", "terminalFontFamily"}}},
		{key: "sshTerminalFontSize", paths: [][]string{{"terminal", "fontSize"}, {"ssh", "terminalFontSize"}}},
		{key: "ingressBaotaSyncEnabled", paths: [][]string{{"ingress", "baotaSyncEnabled"}}},
		{key: "ingressNginxManifestUrl", paths: [][]string{{"ingress", "nginxManifestUrl"}}},
		{key: "ingressNginxHostHttpPort", paths: [][]string{{"ingress", "nginxHostHttpPort"}}},
		{key: "ingressNginxHostHttpsPort", paths: [][]string{{"ingress", "nginxHostHttpsPort"}}},
		{key: "ingressNginxControllerNodeName", paths: [][]string{{"ingress", "nginxControllerNodeName"}}},
		{key: "k8sAddonsManifestMirror", paths: [][]string{{"k8sAddons", "manifestMirror"}}},
		{key: "vcenterCacheTtlSec", paths: [][]string{{"vcenter", "cacheTtlSec"}}},
		{key: "idracHost", paths: [][]string{{"idrac", "host"}}},
		{key: "idracUser", paths: [][]string{{"idrac", "user"}}},
		{key: "idracPassword", paths: [][]string{{"idrac", "password"}}},
		{key: "idracInsecure", paths: [][]string{{"idrac", "insecure"}}},
		{key: "k8sSidebarMenu", paths: [][]string{{"k8s", "sidebarMenu"}}},
		{key: "k8s", paths: [][]string{{"k8s"}}},
	}
}

func runtimeSettingsFromConfigYAML(raw []byte) (*RuntimeSettings, bool, error) {
	jsonBytes, err := sigyaml.YAMLToJSON(raw)
	if err != nil {
		return nil, false, err
	}
	var top map[string]json.RawMessage
	if err := json.Unmarshal(jsonBytes, &top); err != nil {
		return nil, false, err
	}
	if rawRuntime, ok := top["runtime"]; ok && len(rawRuntime) > 0 && string(rawRuntime) != "null" {
		var rs RuntimeSettings
		if err := json.Unmarshal(rawRuntime, &rs); err != nil {
			return nil, false, err
		}
		return &rs, true, nil
	}
	if hasBusinessConfigSection(top) {
		return nil, false, nil
	}
	keys := runtimeSettingsJSONKeys()
	for k := range top {
		if _, ok := keys[k]; ok {
			var rs RuntimeSettings
			if err := json.Unmarshal(jsonBytes, &rs); err != nil {
				return nil, false, err
			}
			return &rs, true, nil
		}
	}
	return nil, false, nil
}

func runtimeSettingsJSONKeys() map[string]struct{} {
	t := reflect.TypeOf(RuntimeSettings{})
	out := make(map[string]struct{}, t.NumField())
	for i := 0; i < t.NumField(); i++ {
		name := strings.Split(t.Field(i).Tag.Get("json"), ",")[0]
		if name == "" || name == "-" {
			continue
		}
		out[name] = struct{}{}
	}
	return out
}

func RuntimeSettingsFromConfig(cfg Config) *RuntimeSettings {
	rs := &RuntimeSettings{
		Version:                        1,
		Initialized:                    true,
		BaotaURL:                       cfg.BaotaURL,
		BaotaAPIKey:                    cfg.BaotaAPIKey,
		BaotaTargets:                   runtimeBaotaTargetsFromConfig(cfg.BaotaTargets),
		BaotaHTTPTimeoutSec:            int(cfg.BaotaHTTPTimeout.Seconds()),
		BaotaTCPProbeTimeoutSec:        int(cfg.BaotaTCPProbeTimeout.Seconds()),
		BaotaCheckMinIntervalSec:       int(cfg.BaotaCheckMinInterval.Seconds()),
		DDNSHost:                       cfg.DDNSHost,
		DefaultPort:                    cfg.DefaultPort,
		BaotaUpstreamHost:              cfg.BaotaUpstreamHost,
		BaotaUpstreamPort:              cfg.BaotaUpstreamPort,
		BaotaUpstreamScheme:            cfg.BaotaUpstreamScheme,
		BaotaSSLCertName:               cfg.BaotaSSLCertName,
		BaotaSSLPemPath:                cfg.BaotaSSLPemPath,
		BaotaSSLKeyPath:                cfg.BaotaSSLKeyPath,
		SyncIntervalSec:                int(cfg.SyncInterval.Seconds()),
		DashboardUser:                  cfg.DashboardUser,
		DashboardPassword:              cfg.DashboardPassword,
		DashboardSessionSecret:         cfg.DashboardSessionSecret,
		DashboardSessionDays:           cfg.DashboardSessionDays,
		DashboardCookieSecure:          cfg.DashboardCookieSecure,
		DashboardListenAddr:            cfg.DashboardListenAddr,
		OIDCIssuerURL:                  cfg.OIDCIssuerURL,
		OIDCClientID:                   cfg.OIDCClientID,
		OIDCClientSecret:               cfg.OIDCClientSecret,
		OIDCRedirectURL:                cfg.OIDCRedirectURL,
		OIDCScopes:                     cfg.OIDCScopes,
		OIDCSupportedSigningAlgs:       cfg.OIDCSupportedSigningAlgs,
		PrometheusURL:                  cfg.PrometheusURL,
		PrometheusURLK8s:               cfg.PrometheusURLK8s,
		PrometheusURLVCenter:           cfg.PrometheusURLVCenter,
		PrometheusURLPVE:               cfg.PrometheusURLPVE,
		PrometheusURLCloud:             cfg.PrometheusURLCloud,
		PrometheusTimeoutSec:           int(cfg.PrometheusTimeout.Seconds()),
		PrometheusSkipTLS:              cfg.PrometheusSkipTLS,
		PrometheusBearerToken:          cfg.PrometheusBearerToken,
		VMSelectURLK8s:                 cfg.VMSelectURLK8s,
		VMSelectURLVCenter:             cfg.VMSelectURLVCenter,
		VMSelectURLPVE:                 cfg.VMSelectURLPVE,
		VMSelectURLCloud:               cfg.VMSelectURLCloud,
		VictoriaLogsURL:                cfg.VictoriaLogsURL,
		VMLogVectorDownloadBaseURL:     cfg.VMLogVectorDownloadBaseURL,
		GeoLite2CountryMMDB:            cfg.GeoLite2CountryMMDB,
		HarborBaseURL:                  cfg.HarborBaseURL,
		HarborUsername:                 cfg.HarborUsername,
		HarborPassword:                 cfg.HarborPassword,
		HarborSkipTLS:                  cfg.HarborSkipTLS,
		VCenterURL:                     cfg.VCenterURL,
		VCenterUser:                    cfg.VCenterUser,
		VCenterPassword:                cfg.VCenterPassword,
		VCenterInsecure:                cfg.VCenterInsecure,
		VCenterWmksScriptURL:           cfg.VCenterWmksScriptURL,
		VCenterWmksCssURL:              cfg.VCenterWmksCssURL,
		VCenterUIBaseURL:               cfg.VCenterUIBaseURL,
		VCenterConsoleHost:             cfg.VCenterConsoleHost,
		VCenterUIThumbprint:            cfg.VCenterUIThumbprint,
		VCenterVMSshUser:               cfg.VCenterVMSshUser,
		VCenterVMSshPrivateKeyPath:     cfg.VCenterVMSshPrivateKeyPath,
		VCenterVMSshPassword:           cfg.VCenterVMSshPassword,
		VCenterVMSshKeyPassphrase:      cfg.VCenterVMSshKeyPassphrase,
		VCenterVMSshPort:               cfg.VCenterVMSshPort,
		VCenterVMSshInsecureHostKey:    cfg.VCenterVMSshInsecureHostKey,
		SSHSettingsBackend:             string(cfg.SSHSettingsBackend),
		EncryptionKey:                  cfg.EncryptionKey,
		RedisAddr:                      cfg.RedisAddr,
		RedisPassword:                  cfg.RedisPassword,
		RedisDB:                        cfg.RedisDB,
		RedisKeyPrefix:                 cfg.RedisKeyPrefix,
		RedisMode:                      cfg.RedisMode,
		RedisHost:                      cfg.RedisHost,
		RedisPort:                      cfg.RedisPort,
		RedisSentinelMaster:            cfg.RedisSentinelMaster,
		RedisImageRegistry:             cfg.RedisImageRegistry,
		RedisExporterImageRegistry:     cfg.RedisExporterImageRegistry,
		RedisImagePullSecret:           cfg.RedisImagePullSecret,
		RedisEngineImages:              cfg.RedisEngineImages,
		RedisExporterImage:             cfg.RedisExporterImageFull,
		RedisK8sStorageSize:            cfg.RedisK8sStorageSize,
		RedisK8sStorageClass:           cfg.RedisK8sStorageClass,
		MySQLDSN:                       cfg.MySQLDSN,
		MySQLHost:                      cfg.MySQLHost,
		MySQLPort:                      cfg.MySQLPort,
		MySQLDatabase:                  cfg.MySQLDatabase,
		MySQLUser:                      cfg.MySQLUser,
		MySQLPassword:                  cfg.MySQLPassword,
		SSHSettingsDir:                 cfg.SSHSettingsDir,
		PlatformPublicURL:              cfg.PlatformPublicURL,
		PlatformDisplayName:            cfg.PlatformDisplayName,
		PlatformLogoURL:                cfg.PlatformLogoURL,
		PlatformFaviconURL:             cfg.PlatformFaviconURL,
		AssetsCDNBaseURL:               cfg.AssetsCDNBaseURL,
		SshTerminalFontFamily:          cfg.SshTerminalFontFamily,
		SshTerminalFontSize:            cfg.SshTerminalFontSize,
		IngressBaotaSyncEnabled:        cfg.IngressBaotaSyncEnabled,
		IngressNginxManifestURL:        cfg.IngressNginxManifestURL,
		IngressNginxHostHTTPPort:       int(cfg.IngressNginxHostHTTPPort),
		IngressNginxHostHTTPSPort:      int(cfg.IngressNginxHostHTTPSPort),
		IngressNginxControllerNodeName: cfg.IngressNginxControllerNodeName,
		K8sAddonsManifestMirror:        cfg.K8sAddonsManifestMirror,
		VCenterCacheTTLSec:             cfg.VCenterCacheTTLSec,
		IdracHost:                      cfg.IdracHost,
		IdracUser:                      cfg.IdracUser,
		IdracPassword:                  cfg.IdracPassword,
		IdracInsecure:                  cfg.IdracInsecure,
		K8sSidebarMenu:                 RuntimeK8sSidebarMenuEffective(nil),
	}
	skipBaotaTLS := cfg.BaotaSkipTLSVerify
	disableBaotaKeepAlive := cfg.BaotaDisableHTTPKeepAlive
	redisK8sPersistence := cfg.RedisK8sPersistenceEnabled
	rs.BaotaSkipTLSVerify = &skipBaotaTLS
	rs.BaotaDisableHTTPKeepAlive = &disableBaotaKeepAlive
	rs.RedisK8sPersistence = &redisK8sPersistence
	if cfg.OIDCSkipIssuerCheck {
		v := true
		rs.OIDCSkipIssuerCheck = &v
	}
	if cfg.OIDCSkipClientIDCheck {
		v := true
		rs.OIDCSkipClientIDCheck = &v
	}
	if cfg.OIDCClockSkewSec > 0 {
		v := cfg.OIDCClockSkewSec
		rs.OIDCClockSkewSec = &v
	}
	return rs
}

func runtimeBaotaTargetsFromConfig(in []BaotaTargetEntry) []RuntimeBaotaTarget {
	if len(in) == 0 {
		return nil
	}
	out := make([]RuntimeBaotaTarget, 0, len(in))
	for _, t := range in {
		out = append(out, RuntimeBaotaTarget{
			ID:            t.ID,
			Name:          t.DisplayName,
			URL:           t.URL,
			ApiKey:        t.APIKey,
			SkipTlsVerify: t.SkipTLSVerify,
			Default:       t.DefaultForSync,
		})
	}
	return out
}
