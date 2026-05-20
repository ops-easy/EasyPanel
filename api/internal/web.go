package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"kube-bt-sync/internal/transport/authz"

	"github.com/gin-gonic/gin"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"sigs.k8s.io/yaml" // K8s 官方 YAML 库
)

type YamlRequest struct {
	YamlContent string `json:"yamlContent" binding:"required"`
	// SkipWorkloadSchedulingCheck 为 true 时跳过 Deployment/StatefulSet 更新前的调度余量预检（应急用）。
	SkipWorkloadSchedulingCheck bool `json:"skipWorkloadSchedulingCheck"`
}

type DeleteIngressRequest struct {
	Namespace   string `json:"namespace" binding:"required"`
	Name        string `json:"name" binding:"required"`
	Domain      string `json:"domain"`
	DeleteBaota bool   `json:"deleteBaota"`
}

// NewRouter 构造 Dashboard HTTP 路由，供服务启动和路由护栏测试复用。
func NewRouter(app *ServerApp) *gin.Engine {
	r := gin.New()
	RegisterLegacyRoutes(r, app)
	return r
}

// RegisterLegacyRoutes 注册迁移期仍留在 package internal 的 Dashboard 路由，并返回带鉴权中间件的 /api 路由组。
func RegisterLegacyRoutes(r *gin.Engine, app *ServerApp) *gin.RouterGroup {
	r.Use(gin.Recovery())
	cfg := app.Cfg()
	if cfg.PerformanceMode {
		gin.SetMode(gin.ReleaseMode)
		log.Printf("config: KUBEBT_PERFORMANCE_MODE 已启用（Gin release；Redis 可用时 /api/namespaces 缓存约 %d 秒）", cfg.NamespacesCacheTTLSec)
	}
	configureGinTrustedProxies(r, cfg)
	r.Use(auditAccessLogMiddleware(app))
	// Prometheus 抓取内置指标（缓存命中、控制平面建议严重度等）；无需登录，建议仅集群内网访问。
	r.GET("/metrics", func(c *gin.Context) {
		handlePrometheusMetrics(c.Writer, c.Request)
	})

	// 无需登录：探活、初始化向导、登录态
	r.GET("/api/health", handleHealth(app))
	r.GET("/api/setup/status", handleSetupStatus(app))
	r.POST("/api/setup", handleSetupSave(app))
	r.GET("/api/auth/status", func(c *gin.Context) { handleAuthStatus(c, app) })
	r.GET("/api/auth/login-challenge", handleAuthLoginChallenge(app))
	r.GET("/api/login/public-status", handleLoginPublicStatus(app))
	r.POST("/api/auth/login", func(c *gin.Context) { handleAuthLogin(c, app) })
	r.POST("/api/auth/login-totp", handleAuthLoginTotp(app))
	r.GET("/api/auth/totp/setup-provision", handleTotpSetupProvision(app))
	r.POST("/api/auth/totp/setup-verify", handleTotpSetupVerify(app))
	r.POST("/api/auth/logout", func(c *gin.Context) { handleAuthLogout(c, app) })
	r.GET("/api/auth/oidc/login", handleOIDCLogin(app))
	r.GET("/api/auth/oidc/callback", handleOIDCCallback(app))
	log.Println("Dashboard: GET /api/health、/api/setup/status、/api/auth/status、/api/login/public-status、OIDC /api/auth/oidc/* 无需登录；未初始化时 POST /api/setup")

	api := r.Group("/api")
	api.Use(DashboardAuthMiddleware(app))
	api.Use(ViewerRestrictionsMiddleware(app))
	api.Use(apiResponseCacheMiddleware(app))
	{
		api.GET("/config", func(c *gin.Context) { handleGetConfig(c, app) })
		api.GET("/runtime/status", func(c *gin.Context) { handleGetRuntimeStatus(c, app) })
		api.GET("/system/check", func(c *gin.Context) { handleSystemCheck(c, app) })
		api.GET("/namespaces", func(c *gin.Context) { handleGetNamespaces(c, app) })
		api.GET("/services", func(c *gin.Context) { handleGetServices(c, app.K8s()) })
		api.GET("/ingresses", func(c *gin.Context) { handleListAllIngresses(c, app.K8s(), app.Cfg()) })
		api.GET("/status", func(c *gin.Context) { handleGetStatus(c, app.K8s(), app.Cfg()) })
		api.GET("/ingress/raw", func(c *gin.Context) { handleGetIngressRaw(c, app.K8s()) })
		api.POST("/ingress/yaml", func(c *gin.Context) { handleApplyYaml(c, app.K8s()) })
		api.POST("/ingress/delete", func(c *gin.Context) { handleDeleteIngress(c, app.K8s(), app.Cfg()) })
		api.GET("/settings/runtime", handleGetRuntimeSettings(app))
		api.PUT("/settings/runtime", handlePutRuntimeSettings(app))
		api.GET("/audit/logs", AdminOnlyMiddleware(app), handleGetAuditLogs(app))
		api.GET("/audit/summary", AdminOnlyMiddleware(app), handleGetAuditSummary(app))
		api.GET("/audit/site-stats", AdminOnlyMiddleware(app), handleGetSiteStats(app))
		api.GET("/audit/harbor-dashboard", AdminOnlyMiddleware(app), handleGetHarborAdminDashboard(app))
		api.GET("/account/oidc/bind/start", handleOIDCBindStart(app))
		api.GET("/host/egress-notification", handleHostEgressNotification(app))
		api.POST("/host/egress-notification/read", handleHostEgressNotificationRead(app))
		api.POST("/host/security-login-alert/read", handleSecurityLoginAlertRead(app))
		api.POST("/host/remote-login-alert/read", handleRemoteLoginAlertRead(app))
		api.POST("/host/admin-ip-ban-alert/read", handleAdminIpBanAlertRead(app))
		api.GET("/prometheus/status", func(c *gin.Context) { handlePrometheusStatus(c, app.Cfg()) })
		api.GET("/prometheus/discover", func(c *gin.Context) { handlePrometheusDiscover(c, app.K8s()) })
		api.POST("/prometheus/source", func(c *gin.Context) { handlePrometheusSource(c, app.Cfg()) })
		api.GET("/prometheus/query", func(c *gin.Context) { handlePrometheusQuery(c, app) })
		api.POST("/prometheus/query", func(c *gin.Context) { handlePrometheusQuery(c, app) })
		api.GET("/prometheus/query_range", func(c *gin.Context) { handlePrometheusQueryRange(c, app) })
		api.POST("/prometheus/query_range", func(c *gin.Context) { handlePrometheusQueryRange(c, app) })
		api.POST("/prometheus/validate-config-yaml", func(c *gin.Context) { handlePrometheusConfigYAMLValidate(c) })
		api.GET("/prometheus/vcenter-metrics", func(c *gin.Context) { handleVCenterPrometheusMetrics(c, app) })

		registerCloudHostRoutes(api, app)
		registerAdminUserRoutes(api, app)
		registerAccountProfileRoutes(api, app)
	}
	log.Println("Dashboard: WebSocket /api/k8s/pods/.../exec/ws、/api/app-center/redis/instances/:id/redis-cli/ws、/api/vcenter/vms/.../console-ws、/api/vcenter/vms/.../ssh/ws、/api/cloud-hosts/:id/ssh/ws、/api/app-center/redis/runtime/ws；GET/DELETE pods；GET summary、namespaces/stats、pods、deployments、statefulsets、daemonsets、pvcs、configmaps、services、nodes；GET/POST prometheus；vCenter API、cloud-hosts")

	registerFrontendRoutes(r, app)

	if app.Cfg().EnableBackgroundJobs {
		StartAuditRetentionPruner(app)
	}
	return api
}

// resolveFrontendDistDir 查找 Vite 构建产物：环境变量 DASHBOARD_STATIC_DIR、当前目录、可执行文件旁 web/dist。
func resolveFrontendDistDir() string {
	if v := strings.TrimSpace(os.Getenv("DASHBOARD_STATIC_DIR")); v != "" {
		return v
	}
	candidates := make([]string, 0, 8)
	candidates = append(candidates,
		filepath.Join("web", "dist"),
		filepath.Join("..", "web", "dist"),
	)
	if exe, err := os.Executable(); err == nil {
		exePath := exe
		if rp, err := filepath.EvalSymlinks(exe); err == nil {
			exePath = rp
		}
		exeDir := filepath.Dir(exePath)
		candidates = append([]string{
			filepath.Join(exeDir, "web", "dist"),
			filepath.Join(exeDir, "..", "web", "dist"),
		}, candidates...)
	}
	for _, p := range candidates {
		idx := filepath.Join(p, "index.html")
		if fileExists(idx) {
			if abs, err := filepath.Abs(p); err == nil {
				log.Printf("前端静态目录: %s", abs)
			}
			return p
		}
	}
	return filepath.Join("web", "dist")
}

// tryServeFileFromFrontendDist 若 dist 根目录下存在与 URL 路径对应的文件则直接输出（含 favicon、public 下拷贝的 svg/ico）。
// 避免 Gin.StaticFile 在「构建产物里缺文件」时固定返回 404、而 SPA 又无法兜底的问题。
func tryServeFileFromFrontendDist(c *gin.Context, frontendDistDir string) bool {
	p := c.Request.URL.Path
	if p == "/" || p == "" {
		return false
	}
	rel := strings.TrimPrefix(path.Clean("/"+strings.TrimPrefix(p, "/")), "/")
	if rel == "" || strings.Contains(rel, "..") {
		return false
	}
	full := filepath.Join(frontendDistDir, filepath.FromSlash(rel))
	absDist, err := filepath.Abs(frontendDistDir)
	if err != nil {
		return false
	}
	absFull, err := filepath.Abs(full)
	if err != nil {
		return false
	}
	relSafe, err := filepath.Rel(absDist, absFull)
	if err != nil || strings.HasPrefix(relSafe, "..") {
		return false
	}
	fi, err := os.Stat(absFull)
	if err != nil || fi.IsDir() {
		return false
	}
	c.File(absFull)
	return true
}

func registerFrontendRoutes(r *gin.Engine, app *ServerApp) {
	frontendDistDir := resolveFrontendDistDir()
	frontendIndex := filepath.Join(frontendDistDir, "index.html")

	// Prefer the React build output if available.
	if fileExists(frontendIndex) {
		r.Static("/assets", filepath.Join(frontendDistDir, "assets"))
		r.GET("/", func(c *gin.Context) { c.File(frontendIndex) })
		r.NoRoute(func(c *gin.Context) {
			if strings.HasPrefix(c.Request.URL.Path, "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"error": "API 不存在或未注册，请确认已部署包含该接口的版本"})
				return
			}
			if tryServeFileFromFrontendDist(c, frontendDistDir) {
				return
			}
			c.File(frontendIndex)
		})
		log.Println("前端模式: React dist（访问 / 与前端路由请使用本目录构建产物）")
		return
	}

	log.Printf("未找到 %s，前端页面不可用；请执行: cd web && npm run build", frontendIndex)
	r.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未找到前端构建产物，请执行: cd web && npm run build"})
	})
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API 不存在或未注册，请确认已部署包含该接口的版本"})
			return
		}
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "未找到前端构建产物，请执行: cd web && npm run build"})
	})
	log.Println("前端模式: React dist 未构建")
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func handleGetStatus(c *gin.Context, k8sClient *kubernetes.Clientset, cfg Config) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	ingresses, err := k8sClient.NetworkingV1().Ingresses("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "查询 Ingress 失败: "+err.Error())
		return
	}
	result := make([]map[string]interface{}, 0)
	for _, ing := range ingresses.Items {
		if IsManagedIngress(ing.Annotations) {
			targetHost, scheme, port := BaotaOriginTarget(cfg, ing.Annotations)
			domain := "N/A"
			if len(ing.Spec.Rules) > 0 {
				domain = ing.Spec.Rules[0].Host
			}

			result = append(result, map[string]interface{}{
				"namespace": ing.Namespace, "name": ing.Name, "domain": domain,
				"ddnsPort": port, "upstreamHost": targetHost, "createdAt": ing.CreationTimestamp.Format("2006-01-02 15:04:05"),
				"modifiedAt": ing.CreationTimestamp.Format("2006-01-02 15:04:05"),
				"version":    ing.ResourceVersion,
				"scheme":     scheme,
				"status":     "已托管",
			})
		}
	}
	c.JSON(http.StatusOK, result)
}

// 处理前端发来的纯 YAML 字符串
func handleApplyYaml(c *gin.Context, k8sClient *kubernetes.Clientset) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	var req YamlRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}

	// 1. 将 YAML 解析为 K8s 的 Ingress 结构体
	var ingress networkingv1.Ingress
	if err := yaml.Unmarshal([]byte(req.YamlContent), &ingress); err != nil {
		c.JSON(400, gin.H{"error": "YAML 格式错误: " + err.Error()})
		return
	}

	if ingress.Namespace == "" {
		ingress.Namespace = "default"
	}

	// 2. 与 K8s API 交互 (获取现有的资源版本，以支持 Update)
	client := k8sClient.NetworkingV1().Ingresses(ingress.Namespace)
	existing, err := client.Get(context.TODO(), ingress.Name, metav1.GetOptions{})

	op := ""
	if err == nil {
		// 存在则更新，必须带上旧的 ResourceVersion
		ingress.ResourceVersion = existing.ResourceVersion
		_, err = client.Update(context.TODO(), &ingress, metav1.UpdateOptions{})
		op = "更新"
	} else if apierrors.IsNotFound(err) {
		// 不存在则创建
		_, err = client.Create(context.TODO(), &ingress, metav1.CreateOptions{})
		op = "创建"
	} else {
		RespondAPIError500(c, "读取现有资源失败: "+err.Error())
		return
	}

	if err != nil {
		c.JSON(500, gin.H{"error": FriendlyIngressApplyError(err)})
		return
	}

	SetAuditDetail(c, op+" Ingress "+ingress.Namespace+"/"+ingress.Name)
	c.JSON(200, gin.H{"message": "YAML 资源已成功应用到 K8s 集群！"})
}

func handleGetNamespaces(c *gin.Context, app *ServerApp) {
	k8sClient := app.K8s()
	if !GuardK8s(c, k8sClient) {
		return
	}
	cfg := app.Cfg()
	ctx := c.Request.Context()
	prefix := strings.TrimSpace(cfg.RedisKeyPrefix)
	if prefix != "" && !strings.HasSuffix(prefix, ":") {
		prefix += ":"
	}
	cacheKey := prefix + "cache:k8s:namespaces:v1"
	if app.Redis() != nil && cfg.PerformanceMode && cfg.NamespacesCacheTTLSec > 0 {
		if raw, err := app.Redis().Get(ctx, cacheKey); err == nil && raw != "" {
			var cached []string
			if json.Unmarshal([]byte(raw), &cached) == nil && len(cached) > 0 {
				c.JSON(http.StatusOK, cached)
				return
			}
		}
	}
	namespaces, err := k8sClient.CoreV1().Namespaces().List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "查询命名空间失败: "+err.Error())
		return
	}
	items := make([]string, 0, len(namespaces.Items))
	for _, ns := range namespaces.Items {
		items = append(items, ns.Name)
	}
	sort.Strings(items)
	if app.Redis() != nil && cfg.PerformanceMode && cfg.NamespacesCacheTTLSec > 0 {
		if b, err := json.Marshal(items); err == nil {
			_ = app.Redis().Set(ctx, cacheKey, b, time.Duration(cfg.NamespacesCacheTTLSec)*time.Second)
		}
	}
	c.JSON(http.StatusOK, items)
}

func handleGetServices(c *gin.Context, k8sClient *kubernetes.Clientset) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	services, err := k8sClient.CoreV1().Services("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "查询服务失败: "+err.Error())
		return
	}
	result := make([]map[string]interface{}, 0, len(services.Items))
	for _, svc := range services.Items {
		ports := make([]int32, 0, len(svc.Spec.Ports))
		for _, p := range svc.Spec.Ports {
			ports = append(ports, p.Port)
		}
		result = append(result, map[string]interface{}{
			"namespace": svc.Namespace,
			"name":      svc.Name,
			"ports":     ports,
		})
	}
	c.JSON(http.StatusOK, result)
}

func getDashboardRoleFromGin(c *gin.Context) string {
	return authz.DashboardRole(c)
}

func handleGetConfig(c *gin.Context, app *ServerApp) {
	role := getDashboardRoleFromGin(c)
	eff := getEffectiveDashboardPermissionsFromGin(c)
	user, _ := c.Get("dashboardUser")
	us, _ := user.(string)

	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()

	if sec := configAPICacheTTLSec(); sec > 0 {
		if rdb := app.Redis(); rdb != nil {
			key := configAPICacheRedisKey(app.Cfg(), us, role)
			if raw, err := rdb.Get(ctx, key); err == nil && strings.TrimSpace(raw) != "" {
				c.Data(http.StatusOK, "application/json", []byte(raw))
				return
			}
		}
	}

	out := buildConfigMapResponse(app, role, eff)
	b, err := json.Marshal(out)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if sec := configAPICacheTTLSec(); sec > 0 {
		if rdb := app.Redis(); rdb != nil {
			key := configAPICacheRedisKey(app.Cfg(), us, role)
			_ = rdb.Set(context.Background(), key, b, time.Duration(sec)*time.Second)
		}
	}
	c.Data(http.StatusOK, "application/json", b)
}

// buildConfigMapResponse 与 GET /api/config 一致；非 admin 时对配置做脱敏。
func buildConfigMapResponse(app *ServerApp, role string, eff *EffectiveDashboardPermissions) gin.H {
	if eff == nil {
		if role == DashboardRoleAdmin {
			eff = defaultEffectiveAdmin()
		} else {
			eff = defaultEffectiveLegacyViewer()
		}
	}
	cfg := app.Cfg()
	sshStore := app.SSHStore()
	httpsPort := envOrDefault("HTTPS_PORT", "443")
	dashUser := strings.TrimSpace(cfg.DashboardUser)
	if dashUser == "" {
		dashUser = "admin"
	}
	dashDays := cfg.DashboardSessionDays
	if dashDays < 1 {
		dashDays = 7
	}
	out := gin.H{
		"baotaUrl":                  cfg.BaotaURL,
		"ddnsHost":                  cfg.DDNSHost,
		"defaultPort":               cfg.DefaultPort,
		"baotaUpstreamHost":         func() string { h, _, _ := BaotaOriginTarget(cfg, nil); return h }(),
		"baotaUpstreamPort":         func() string { _, _, p := BaotaOriginTarget(cfg, nil); return p }(),
		"baotaUpstreamScheme":       func() string { _, s, _ := BaotaOriginTarget(cfg, nil); return s }(),
		"httpsPort":                 httpsPort,
		"syncIntervalSec":           int(cfg.SyncInterval.Seconds()),
		"baotaHttpTimeoutSec":       int(cfg.BaotaHTTPTimeout.Seconds()),
		"baotaTcpProbeTimeoutSec":   int(cfg.BaotaTCPProbeTimeout.Seconds()),
		"baotaDisableHttpKeepalive": cfg.BaotaDisableHTTPKeepAlive,
		"baotaCheckMinIntervalSec":  int(cfg.BaotaCheckMinInterval.Seconds()),
		"hasBaotaApiKey":            strings.TrimSpace(cfg.BaotaAPIKey) != "",
		"baotaTargets": func() []gin.H {
			var rows []gin.H
			for _, t := range EffectiveBaotaTargets(cfg) {
				stv := cfg.BaotaSkipTLSVerify
				if t.SkipTLSVerify != nil {
					stv = *t.SkipTLSVerify
				}
				nm := strings.TrimSpace(t.DisplayName)
				if nm == "" {
					nm = t.ID
				}
				rows = append(rows, gin.H{
					"id":            t.ID,
					"name":          nm,
					"url":           t.URL,
					"hasApiKey":     strings.TrimSpace(t.APIKey) != "",
					"skipTlsVerify": stv,
					"default":       t.DefaultForSync,
				})
			}
			return rows
		}(),
		"baotaSkipTlsVerify":          cfg.BaotaSkipTLSVerify,
		"baotaSslCertName":            cfg.BaotaSSLCertName,
		"hasBaotaSSLMaterial":         baotaSSLMaterialConfigured(app),
		"dashboardAuthEnabled":        cfg.DashboardAuthEnabled(),
		"passwordLoginEnabled":        cfg.PasswordLoginEnabled(),
		"oidcConfigured":              cfg.OIDCConfigured(),
		"dashboardUser":               dashUser,
		"dashboardSessionDays":        dashDays,
		"dashboardListenAddr":         strings.TrimSpace(cfg.DashboardListenAddr),
		"prometheusConfigured":        GetEffectivePrometheusURL(cfg) != "",
		"prometheusUrlHint":           maskPrometheusURL(GetEffectivePrometheusURL(cfg)),
		"prometheusK8sConfigured":     GetPrometheusURLForScope(cfg, "k8s") != "",
		"prometheusUrlK8sHint":        maskPrometheusURL(GetPrometheusURLForScope(cfg, "k8s")),
		"prometheusVcenterConfigured": GetPrometheusURLForScope(cfg, "vcenter") != "",
		"prometheusUrlVcenterHint":    maskPrometheusURL(GetPrometheusURLForScope(cfg, "vcenter")),
		"prometheusCloudConfigured":   GetPrometheusURLForScope(cfg, "cloud") != "",
		"prometheusUrlCloudHint":      maskPrometheusURL(GetPrometheusURLForScope(cfg, "cloud")),
		"vmSelectUrlK8sHint":          maskPrometheusURL(cfg.VMSelectURLK8s),
		"vmSelectUrlVcenterHint":      maskPrometheusURL(cfg.VMSelectURLVCenter),
		"vmSelectUrlCloudHint":        maskPrometheusURL(cfg.VMSelectURLCloud),
		"victoriaLogsConfigured":      strings.TrimSpace(cfg.VictoriaLogsURL) != "",
		"victoriaLogsUrlHint":         maskPrometheusURL(cfg.VictoriaLogsURL),
		"prometheusTimeoutSec":        int(cfg.PrometheusTimeout.Seconds()),
		"kubebtMetricsPath":           "/metrics",
		"kubebtPrometheusScrapeHint":  "Prometheus 增加 static_configs：targets 为本服务可达地址，metrics_path=/metrics，scheme=http/https 与监听一致；建议仅内网抓取。",
		"prometheusSkipTls":           cfg.PrometheusSkipTLS,
		"prometheusHasBearer":         strings.TrimSpace(cfg.PrometheusBearerToken) != "",
		"vcenterConfigured":           cfg.vCenterConfigured(),
		"vcenterUrlHint":              maskVCenterURL(cfg.VCenterURL),
		"vcenterUiOrigin":             vcenterUIOriginFromURL(cfg.VCenterURL),
		"vcenterUiBaseUrl":            EffectiveVCenterUIBaseURL(cfg),
		"vcenterUiLoginUrl":           vcenterUiLoginURL(cfg),
		// 未设置 WMKS 环境变量时，由 VCENTER_URL 推导常见路径；前端可按 candidates 依次尝试。
		"vcenterWmksScriptUrl":           EffectiveVCenterWmksScriptURL(cfg),
		"vcenterWmksCssUrl":              EffectiveVCenterWmksCssURL(cfg),
		"vcenterWmksScriptUrlCandidates": VCenterWmksScriptURLCandidates(cfg),
		"vcenterWmksCssUrlCandidates":    VCenterWmksCssURLCandidates(cfg),
		"vcenterWmksScriptUrlFromEnv":    strings.TrimSpace(cfg.VCenterWmksScriptURL) != "",
		"vcenterWmksCssUrlFromEnv":       strings.TrimSpace(cfg.VCenterWmksCssURL) != "",
		"vcenterVmSshConfigured":         vcenterSSHConfiguredForUI(cfg, sshStore),
		"vcenterVmSshGlobalConfigured":   cfg.vCenterVMSshConfigured(),
		"sshSettingsBackend":             string(cfg.SSHSettingsBackend),
		"sshStoreEnabled":                sshStore != nil,
		"sshEncryptionReady": func() bool {
			_, err := sshEncryptionKey(cfg)
			return err == nil
		}(),
		"setupInitialized":      app.Initialized(),
		"dataDir":               app.DataDir(),
		"platformPublicUrl":     cfg.PlatformPublicURL,
		"platformDisplayName":   strings.TrimSpace(cfg.PlatformDisplayName),
		"platformLogoUrl":       strings.TrimSpace(cfg.PlatformLogoURL),
		"platformFaviconUrl":    strings.TrimSpace(cfg.PlatformFaviconURL),
		"assetsCdnBaseUrl":      EffectiveAssetsCDNBase(cfg),
		"sshTerminalFontFamily": strings.TrimSpace(cfg.SshTerminalFontFamily),
		"sshTerminalFontSize": func() int {
			if cfg.SshTerminalFontSize <= 0 {
				return 0
			}
			return cfg.SshTerminalFontSize
		}(),
		"ingressBaotaSyncEnabled":        cfg.IngressBaotaSyncEnabled,
		"k8sAddonsManifestMirror":        K8sAddonsManifestMirrorCanonical(ParseManifestMirrorMode(cfg.K8sAddonsManifestMirror)),
		"ingressNginxK8sRegistryMirror":  !cfg.IngressNginxSkipK8sRegistryMirror,
		"ingressNginxHostHttpPort":       int(effectiveIngressNginxHostHTTPPort(app.Runtime(), cfg)),
		"ingressNginxHostHttpsPort":      int(effectiveIngressNginxHostHTTPSPort(app.Runtime(), cfg)),
		"ingressNginxControllerNodeName": effectiveIngressNginxControllerNodeName(app.Runtime(), cfg),
		"vcenterCacheTtlSec":             cfg.VCenterCacheTTLSec,
		"k8sConfigured":                  app.K8s() != nil,
		"harborConfigured":               harborConfiguredFromCfg(cfg),
		"harborUrlHint":                  maskHarborURL(cfg.HarborBaseURL),
		"harborRegistryHost":             harborRegistryPullHost(cfg.HarborBaseURL),
		"harborSkipTls":                  cfg.HarborSkipTLS,
		"redisImageRegistry":             strings.TrimSpace(cfg.RedisImageRegistry),
		"harborRedisConfigured":          strings.TrimSpace(cfg.RedisImageRegistry) != "",
		"imageRegistryConfigured":        strings.TrimSpace(cfg.RedisImageRegistry) != "",
		"redisK8sPersistenceEnabled":     cfg.RedisK8sPersistenceEnabled,
		"redisK8sStorageSize":            cfg.RedisK8sStorageSize,
		"redisK8sStorageClass":           cfg.RedisK8sStorageClass,
		"redisImagePullSecretConfigured": strings.TrimSpace(cfg.RedisImagePullSecret) != "",
		"redisEngineImagesConfigured":    len(cfg.RedisEngineImages) > 0,
		"k8sRuntimeConfigured":           app.Runtime() != nil && K8sRuntimeConfigured(app.Runtime()),
		"vcenterRuntimeConfigured":       VCenterRuntimeCredentialsPresent(cfg),
		"redisAddrPresent":               RedisAddrConfigured(cfg),
		"redisConfigured":                RedisAddrConfigured(cfg),
		"redisConnected":                 app.Redis() != nil,
		"redisError": func() string {
			if !RedisAddrConfigured(cfg) || app.Redis() != nil {
				return ""
			}
			return app.RedisDialError()
		}(),
		"runtimeDualWriteRedis":    cfg.RuntimeDualWriteRedis,
		"redisMirrorRuntimeKey":    redisRuntimeConfigKey(cfg),
		"redisMirrorPlatformKvKey": redisPlatformKVKey(cfg),
		"mysqlDsnConfigured":       strings.TrimSpace(cfg.MySQLDSN) != "",
		"mysqlReachable":           app.MySQLDB() != nil,
		"mysqlConnectError": func() string {
			if strings.TrimSpace(cfg.MySQLDSN) != "" && app.MySQLDB() == nil {
				return app.MySQLConnectError()
			}
			return ""
		}(),
		"platformKvReady":        app.PlatformKV() != nil,
		"dashboardRole":          role,
		"usersManagementEnabled": app.MySQLDB() != nil,
		"docCenterMysqlReady":    app.MySQLDB() != nil,
		"docCosConfigured":       cfg.CosObjectStorageConfigured(),
		"k8sSidebarMenu":         RuntimeK8sSidebarMenuEffective(app.Runtime()),
	}
	if role != DashboardRoleAdmin {
		sanitizeConfigMapForViewer(out)
	}
	out["permissions"] = EffectivePermissionsToPublic(eff)
	return out
}

// sanitizeConfigMapForViewer 隐藏宝塔 URL、密钥状态、vCenter 细节等。
func sanitizeConfigMapForViewer(h gin.H) {
	h["baotaUrl"] = ""
	h["hasBaotaApiKey"] = false
	h["baotaTargets"] = []gin.H{}
	h["baotaSslCertName"] = ""
	h["hasBaotaSSLMaterial"] = false
	h["baotaSkipTlsVerify"] = false
	h["baotaHttpTimeoutSec"] = 0
	h["baotaTcpProbeTimeoutSec"] = 0
	h["baotaCheckMinIntervalSec"] = 0
	h["baotaDisableHttpKeepalive"] = false
	h["ddnsHost"] = ""
	h["defaultPort"] = ""
	h["baotaUpstreamHost"] = ""
	h["baotaUpstreamPort"] = ""
	h["baotaUpstreamScheme"] = "http"
	h["ingressBaotaSyncEnabled"] = false
	h["platformPublicUrl"] = ""
	h["vcenterUrlHint"] = ""
	h["vcenterUiOrigin"] = ""
	h["vcenterUiBaseUrl"] = ""
	h["vcenterUiLoginUrl"] = ""
	h["vcenterWmksScriptUrl"] = ""
	h["vcenterWmksCssUrl"] = ""
	h["vcenterWmksScriptUrlCandidates"] = []string{}
	h["vcenterWmksCssUrlCandidates"] = []string{}
	h["vcenterWmksScriptUrlFromEnv"] = false
	h["vcenterWmksCssUrlFromEnv"] = false
	h["prometheusUrlHint"] = ""
	h["prometheusUrlK8sHint"] = ""
	h["prometheusUrlVcenterHint"] = ""
	h["prometheusUrlCloudHint"] = ""
	h["vmSelectUrlK8sHint"] = ""
	h["vmSelectUrlVcenterHint"] = ""
	h["vmSelectUrlCloudHint"] = ""
	h["victoriaLogsUrlHint"] = ""
	h["victoriaLogsConfigured"] = false
	h["prometheusHasBearer"] = false
	h["mysqlDsnConfigured"] = false
	h["mysqlReachable"] = false
	h["mysqlConnectError"] = ""
	h["redisConfigured"] = false
	h["redisConnected"] = false
	h["redisError"] = ""
	h["redisMirrorRuntimeKey"] = ""
	h["redisMirrorPlatformKvKey"] = ""
	h["dataDir"] = ""
	h["sshEncryptionReady"] = false
	h["sshSettingsBackend"] = ""
	h["sshStoreEnabled"] = false
	h["vcenterVmSshConfigured"] = false
	h["vcenterVmSshGlobalConfigured"] = false
	h["viewer"] = true
}

func vcenterSSHConfiguredForUI(cfg Config, sshStore SSHSettingsStore) bool {
	if cfg.vCenterVMSshConfigured() {
		return true
	}
	if sshStore == nil {
		return false
	}
	_, err := sshEncryptionKey(cfg)
	return err == nil
}

func handleListAllIngresses(c *gin.Context, k8sClient *kubernetes.Clientset, cfg Config) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	ingresses, err := k8sClient.NetworkingV1().Ingresses("").List(context.TODO(), metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, "查询 Ingress 失败: "+err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(ingresses.Items))
	for _, ing := range ingresses.Items {
		hosts := make([]string, 0)
		for _, r := range ing.Spec.Rules {
			if r.Host != "" {
				hosts = append(hosts, r.Host)
			}
		}
		className := ""
		if ing.Spec.IngressClassName != nil {
			className = *ing.Spec.IngressClassName
		}
		if className == "" {
			className = ing.Annotations["kubernetes.io/ingress.class"]
		}
		managed := IsManagedIngress(ing.Annotations)
		item := map[string]interface{}{
			"namespace": ing.Namespace,
			"name":      ing.Name,
			"hosts":     hosts,
			"class":     className,
			"createdAt": ing.CreationTimestamp.Format(time.RFC3339),
			"managed":   managed,
		}
		if managed {
			targetHost, scheme, port := BaotaOriginTarget(cfg, ing.Annotations)
			item["upstreamHost"] = targetHost
			item["scheme"] = scheme
			item["ddnsPort"] = port
			item["baotaTargetId"] = BaotaTargetIDFromIngress(ing.Annotations)
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, out)
}

func handleGetIngressRaw(c *gin.Context, k8sClient *kubernetes.Clientset) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	ns := strings.TrimSpace(c.Query("ns"))
	name := strings.TrimSpace(c.Query("name"))
	if ns == "" || name == "" {
		c.String(http.StatusBadRequest, "缺少参数 ns 或 name")
		return
	}
	ingress, err := k8sClient.NetworkingV1().Ingresses(ns).Get(context.TODO(), name, metav1.GetOptions{})
	if err != nil {
		c.String(http.StatusInternalServerError, "获取 Ingress 失败: %v", err)
		return
	}
	data, err := yaml.Marshal(ingress)
	if err != nil {
		c.String(http.StatusInternalServerError, "序列化 YAML 失败: %v", err)
		return
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", data)
}

func handleDeleteIngress(c *gin.Context, k8sClient *kubernetes.Clientset, cfg Config) {
	if !GuardK8s(c, k8sClient) {
		return
	}
	var req DeleteIngressRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数解析失败: " + err.Error()})
		return
	}
	btCfg := cfg
	if ing, err := k8sClient.NetworkingV1().Ingresses(req.Namespace).Get(context.TODO(), req.Name, metav1.GetOptions{}); err == nil && ing != nil {
		tid := BaotaTargetIDFromIngress(ing.Annotations)
		btCfg = ConfigForBaotaTargetID(cfg, tid)
	}
	if err := k8sClient.NetworkingV1().Ingresses(req.Namespace).Delete(context.TODO(), req.Name, metav1.DeleteOptions{}); err != nil {
		RespondAPIError500(c, "删除 Ingress 失败: "+err.Error())
		return
	}

	msg := "Ingress 删除成功"
	if req.DeleteBaota && strings.TrimSpace(req.Domain) != "" {
		if btErr := DeleteBaotaSiteAndProxy(btCfg, req.Domain); btErr != nil {
			log.Printf("宝塔删除失败，将后台重试: %v", btErr)
			ScheduleBaotaDeleteRetry(btCfg, req.Domain)
			msg = fmt.Sprintf("Ingress 已删除；宝塔清理失败（已排队重试）: %v", btErr)
		} else {
			msg = "Ingress 和宝塔站点均删除成功"
		}
	}
	SetAuditDetail(c, "删除 Ingress "+req.Namespace+"/"+req.Name+"（域名="+strings.TrimSpace(req.Domain)+"，删宝塔="+fmt.Sprintf("%v", req.DeleteBaota)+"）")
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

// 减轻对宝塔面板的 TCP 拨号频率：同一进程内短时复用探活结果（不调用 HTTP API）。
var baotaProbeCache struct {
	mu     sync.Mutex
	at     time.Time
	ok     bool
	errMsg string
	okMsg  string
}

func shouldRetryBaotaTCPProbe(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "timeout") || strings.Contains(s, "deadline") ||
		strings.Contains(s, "connection reset") || strings.Contains(s, "eof") ||
		strings.Contains(s, "reset by peer") || strings.Contains(s, "connection refused")
}

func probeBaotaTCPWithRetry(cfg Config) error {
	err := ProbeBaotaTCP(cfg)
	if err != nil && shouldRetryBaotaTCPProbe(err) {
		time.Sleep(time.Second)
		err = ProbeBaotaTCP(cfg)
	}
	return err
}

func probeBaotaForSystemCheck(cfg Config) (status string, msg string) {
	if strings.TrimSpace(cfg.BaotaURL) == "" {
		return "skipped", "未配置宝塔（可在设置中填写并开启 Ingress↔宝塔同步）"
	}
	okMsg := "TCP 可达（未调用宝塔 HTTP API）"
	if cfg.BaotaCheckMinInterval <= 0 {
		if err := probeBaotaTCPWithRetry(cfg); err != nil {
			return "error", err.Error()
		}
		return "success", okMsg
	}
	baotaProbeCache.mu.Lock()
	defer baotaProbeCache.mu.Unlock()
	if !baotaProbeCache.at.IsZero() && time.Since(baotaProbeCache.at) < cfg.BaotaCheckMinInterval {
		if baotaProbeCache.ok {
			return "success", baotaProbeCache.okMsg
		}
		return "error", baotaProbeCache.errMsg
	}
	err := probeBaotaTCPWithRetry(cfg)
	baotaProbeCache.at = time.Now()
	if err != nil {
		baotaProbeCache.ok = false
		baotaProbeCache.errMsg = err.Error()
		return "error", err.Error()
	}
	baotaProbeCache.ok = true
	baotaProbeCache.okMsg = okMsg
	baotaProbeCache.errMsg = ""
	return "success", okMsg
}

func handleSystemCheck(c *gin.Context, app *ServerApp) {
	out := buildSystemCheckResponse(c.Request.Context(), app, getDashboardRoleFromGin(c))
	c.JSON(http.StatusOK, out)
}

// buildSystemCheckResponse 与 GET /api/system/check 一致。
func buildSystemCheckResponse(ctx context.Context, app *ServerApp, role string) gin.H {
	k8sClient := app.K8s()
	cfg := app.Cfg()
	k8sProbeCtx, k8sProbeCancel := context.WithTimeout(ctx, 8*time.Second)
	defer k8sProbeCancel()
	if role == DashboardRoleViewer {
		ingressInstalled := false
		ingressHostNetwork := false
		nodeIP := ""
		if k8sClient != nil {
			ingressInstalled = DetectIngressController(k8sProbeCtx, k8sClient)
			ingressHostNetwork = DetectIngressControllerHostNetwork(k8sProbeCtx, k8sClient)
			nodeIP = FirstNodeIPPreferInternal(k8sProbeCtx, k8sClient)
		}
		return gin.H{
			"baota": gin.H{"status": "hidden", "url": "", "msg": "仅管理员可查看宝塔连通性"},
			"ddns":  gin.H{"status": "hidden", "host": "", "ips": []string{}, "msg": "仅管理员可查看", "port443": false, "httpsPort": "443"},
			"k8s": gin.H{
				"ingressInstalled":   ingressInstalled,
				"ingressHostNetwork": ingressHostNetwork,
				"nodeIP":             nodeIP,
			},
		}
	}

	baotaStatus, baotaMsg := probeBaotaForSystemCheck(cfg)

	ddnsIPs, _ := net.LookupHost(cfg.DDNSHost)
	ddnsStatus := "success"
	ddnsMsg := fmt.Sprintf("默认端口(%s)检查通过", cfg.DefaultPort)
	if len(ddnsIPs) == 0 {
		ddnsStatus = "error"
		ddnsMsg = "域名解析失败"
	}

	if !isTCPReachable(cfg.DDNSHost, cfg.DefaultPort, 2*time.Second) {
		ddnsStatus = "warning"
		ddnsMsg = fmt.Sprintf("默认端口(%s)不可达", cfg.DefaultPort)
	}

	httpsPort := envOrDefault("HTTPS_PORT", "443")
	port443 := isTCPReachable(cfg.DDNSHost, httpsPort, 2*time.Second)

	ingressInstalled := false
	ingressHostNetwork := false
	nodeIP := ""
	if k8sClient != nil {
		ingressInstalled = DetectIngressController(k8sProbeCtx, k8sClient)
		ingressHostNetwork = DetectIngressControllerHostNetwork(k8sProbeCtx, k8sClient)
		nodeIP = FirstNodeIPPreferInternal(k8sProbeCtx, k8sClient)
	}

	return gin.H{
		"baota": gin.H{
			"status": baotaStatus,
			"url":    cfg.BaotaURL,
			"msg":    baotaMsg,
		},
		"ddns": gin.H{
			"status":    ddnsStatus,
			"host":      cfg.DDNSHost,
			"ips":       ddnsIPs,
			"msg":       ddnsMsg,
			"port443":   port443,
			"httpsPort": httpsPort,
		},
		"k8s": gin.H{
			"ingressInstalled":   ingressInstalled,
			"ingressHostNetwork": ingressHostNetwork,
			"nodeIP":             nodeIP,
		},
	}
}

func isTCPReachable(host, port string, timeout time.Duration) bool {
	host = strings.TrimSpace(host)
	port = strings.TrimSpace(port)
	if host == "" || port == "" {
		return false
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), timeout)
	if err != nil {
		return false
	}
	_ = conn.Close()
	return true
}

func envOrDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
