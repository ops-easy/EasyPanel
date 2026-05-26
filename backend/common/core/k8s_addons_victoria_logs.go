package core

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const (
	victoriaMetricsHelmRepoURL           = "https://victoriametrics.github.io/helm-charts/"
	victoriaLogsSingleChartName          = "victoria-logs-single"
	victoriaLogsCollectorChartName       = "victoria-logs-collector"
	victoriaLogsDefaultStorageSize       = "20Gi"
	victoriaLogsServerPort         int32 = 9428
)

type VictoriaLogsInstallOpts struct {
	Namespace          string
	ReleaseName        string
	RetentionDays      int
	StorageClassName   string
	StorageSize        string
	CollectorEnabled   bool
	AutoWriteRuntime   bool
	ManifestMirrorMode ManifestMirrorMode
}

type VictoriaLogsInstallResult struct {
	Namespace           string
	ReleaseName         string
	ServiceName         string
	VictoriaLogsBaseURL string
	RuntimePatched      bool
	PatchError          string
}

func victoriaLogsRetentionDaysOrDefault(days int) int {
	if days <= 0 {
		return 180
	}
	if days < 7 {
		return 7
	}
	if days > 730 {
		return 730
	}
	return days
}

func victoriaLogsServerServiceName(releaseName string) string {
	releaseName = firstValidAddonReleaseName(releaseName, defaultVictoriaLogsAddonReleaseName)
	return releaseName + "-victoria-logs-single-server"
}

func victoriaLogsInternalURL(namespace, serviceName string, port int32) string {
	namespace = firstValidAddonNamespace(namespace, defaultVictoriaLogsAddonNamespace)
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		serviceName = victoriaLogsServerServiceName(defaultVictoriaLogsAddonReleaseName)
	}
	if port <= 0 {
		port = victoriaLogsServerPort
	}
	return fmt.Sprintf("http://%s.%s.svc:%d", serviceName, namespace, port)
}

func buildVictoriaLogsSingleValuesYAML(opts VictoriaLogsInstallOpts) string {
	retentionDays := victoriaLogsRetentionDaysOrDefault(opts.RetentionDays)
	storageSize := strings.TrimSpace(opts.StorageSize)
	if storageSize == "" {
		storageSize = victoriaLogsDefaultStorageSize
	}
	var b strings.Builder
	fmt.Fprintf(&b, "server:\n  retentionPeriod: %dd\n  persistentVolume:\n    enabled: true\n    size: %q\n", retentionDays, storageSize)
	if sc := strings.TrimSpace(opts.StorageClassName); sc != "" {
		fmt.Fprintf(&b, "    storageClassName: %q\n", sc)
	}
	return b.String()
}

func buildVictoriaLogsCollectorValuesYAML(remoteURL string) string {
	remoteURL = strings.TrimSpace(remoteURL)
	if remoteURL == "" {
		remoteURL = "http://victoria-logs:9428"
	}
	return fmt.Sprintf(`remoteWrite:
  - url: %q
resources:
  limits:
    cpu: 100m
    memory: 128Mi
  requests:
    cpu: 50m
    memory: 64Mi
`, remoteURL)
}

func helmTemplateRemoteChart(ctx context.Context, helmBin, workDir, releaseName, namespace, chartName string, values []byte) ([]byte, error) {
	valuesPath := filepath.Join(workDir, releaseName+"-"+chartName+"-values.yaml")
	if err := os.WriteFile(valuesPath, values, 0600); err != nil {
		return nil, err
	}
	cmd := exec.CommandContext(ctx, helmBin, "template", releaseName, chartName,
		"--repo", victoriaMetricsHelmRepoURL,
		"--namespace", namespace,
		"-f", valuesPath,
	)
	cmd.Env = helmHelmEnv(workDir)
	cmd.Dir = workDir
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("helm template %s 失败: %w\nstderr=%s", chartName, err, string(ee.Stderr))
		}
		return nil, fmt.Errorf("helm template %s: %w", chartName, err)
	}
	return out, nil
}

func findVictoriaLogsStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, namespace, releaseName string) (*appsv1.StatefulSet, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	list, err := k8s.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/instance=" + releaseName,
	})
	if err == nil && list != nil {
		for i := range list.Items {
			st := &list.Items[i]
			if strings.Contains(strings.ToLower(st.Name), "victoria-logs") {
				return st, nil
			}
		}
		if len(list.Items) > 0 {
			return &list.Items[0], nil
		}
	}
	fallbacks := []string{
		releaseName + "-victoria-logs-single-server",
		releaseName + "-server",
	}
	var last error
	for _, name := range fallbacks {
		st, e := k8s.AppsV1().StatefulSets(namespace).Get(ctx, name, metav1.GetOptions{})
		if e == nil && st != nil {
			return st, nil
		}
		last = e
	}
	if last == nil {
		last = fmt.Errorf("未找到 StatefulSet")
	}
	return nil, last
}

func findVictoriaLogsService(ctx context.Context, k8s *kubernetes.Clientset, namespace, releaseName string) (*corev1.Service, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	name := victoriaLogsServerServiceName(releaseName)
	if svc, err := k8s.CoreV1().Services(namespace).Get(ctx, name, metav1.GetOptions{}); err == nil && svc != nil {
		return svc, nil
	}
	list, err := k8s.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/instance=" + releaseName,
	})
	if err != nil {
		return nil, err
	}
	for i := range list.Items {
		svc := &list.Items[i]
		ln := strings.ToLower(svc.Name)
		if strings.Contains(ln, "victoria-logs") || strings.Contains(ln, "vlogs") {
			return svc, nil
		}
	}
	return nil, fmt.Errorf("未找到 VictoriaLogs Service %s/%s", namespace, name)
}

func victoriaLogsURLFromService(svc *corev1.Service) string {
	if svc == nil {
		return ""
	}
	port := victoriaLogsServerPort
	for _, p := range svc.Spec.Ports {
		if p.Port == victoriaLogsServerPort || p.Name == "http" || p.Name == "http-web" {
			port = p.Port
			break
		}
	}
	return victoriaLogsInternalURL(svc.Namespace, svc.Name, port)
}

func InstallVictoriaLogsAddon(ctx context.Context, app *ServerApp, platformCfg Config, opts VictoriaLogsInstallOpts) (*VictoriaLogsInstallResult, error) {
	if app == nil || app.K8s() == nil || app.K8sREST() == nil {
		return nil, fmt.Errorf("Kubernetes 未连接")
	}
	namespace := firstValidAddonNamespace(opts.Namespace, defaultVictoriaLogsAddonNamespace)
	releaseName := firstValidAddonReleaseName(opts.ReleaseName, defaultVictoriaLogsAddonReleaseName)
	helmBin, err := resolveHelmBinary()
	if err != nil {
		return nil, fmt.Errorf("未找到 helm 可执行文件：请在镜像内放置 /app/helm，或设置 HELM_BIN，或将 helm 加入 PATH: %w", err)
	}
	workDir, err := os.MkdirTemp("", "easypanel-vlogs-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(workDir) }()

	if err := ensureNamespace(ctx, app.K8s(), namespace); err != nil {
		return nil, fmt.Errorf("创建或确认命名空间 %s: %w", namespace, err)
	}
	rendered, err := helmTemplateRemoteChart(ctx, helmBin, workDir, releaseName, namespace, victoriaLogsSingleChartName, []byte(buildVictoriaLogsSingleValuesYAML(opts)))
	if err != nil {
		return nil, err
	}
	if !platformCfg.IngressNginxSkipK8sRegistryMirror {
		rendered = RewriteKubePrometheusRenderedImages(rendered)
	}
	if err := applyYAMLManifestDynamic(ctx, app.K8sREST(), rendered); err != nil {
		return nil, fmt.Errorf("应用 VictoriaLogs 清单: %w", err)
	}

	serviceName := victoriaLogsServerServiceName(releaseName)
	baseURL := victoriaLogsInternalURL(namespace, serviceName, victoriaLogsServerPort)
	if opts.CollectorEnabled {
		collectorRelease := releaseName + "-collector"
		collector, err := helmTemplateRemoteChart(ctx, helmBin, workDir, collectorRelease, namespace, victoriaLogsCollectorChartName, []byte(buildVictoriaLogsCollectorValuesYAML("http://"+serviceName+":9428")))
		if err != nil {
			return nil, err
		}
		if !platformCfg.IngressNginxSkipK8sRegistryMirror {
			collector = RewriteKubePrometheusRenderedImages(collector)
		}
		if err := applyYAMLManifestDynamic(ctx, app.K8sREST(), collector); err != nil {
			return nil, fmt.Errorf("应用 VictoriaLogs collector 清单: %w", err)
		}
	}

	if svc, err := findVictoriaLogsService(ctx, app.K8s(), namespace, releaseName); err == nil && svc != nil {
		serviceName = svc.Name
		baseURL = victoriaLogsURLFromService(svc)
	}
	res := &VictoriaLogsInstallResult{
		Namespace:           namespace,
		ReleaseName:         releaseName,
		ServiceName:         serviceName,
		VictoriaLogsBaseURL: baseURL,
	}
	if opts.AutoWriteRuntime {
		if err := PatchRuntimeVictoriaLogsURL(app, baseURL, victoriaLogsRetentionDaysOrDefault(opts.RetentionDays)); err != nil {
			res.PatchError = err.Error()
		} else {
			res.RuntimePatched = true
		}
	}
	return res, nil
}

func WaitVerifyVictoriaLogsAddon(ctx context.Context, k8s *kubernetes.Clientset, namespace, releaseName string, maxWait time.Duration) IngressAddonVerification {
	started := time.Now()
	ns := firstValidAddonNamespace(namespace, defaultVictoriaLogsAddonNamespace)
	release := firstValidAddonReleaseName(releaseName, defaultVictoriaLogsAddonReleaseName)
	deadline := time.Now().Add(maxWait)
	var last []IngressAddonCheck
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			break
		}
		var checks []IngressAddonCheck
		st, stErr := findVictoriaLogsStatefulSet(ctx, k8s, ns, release)
		stOK := false
		stDetail := ""
		if stErr != nil || st == nil {
			stDetail = manifestErrSnippet(stErr, 140)
		} else {
			want := int32(1)
			if st.Spec.Replicas != nil {
				want = *st.Spec.Replicas
			}
			stOK = st.Status.ReadyReplicas >= want
			stDetail = fmt.Sprintf("%s ready %d/%d", st.Name, st.Status.ReadyReplicas, want)
		}
		checks = append(checks, IngressAddonCheck{Name: "VictoriaLogs StatefulSet", OK: stOK, Detail: stDetail})

		svc, svcErr := findVictoriaLogsService(ctx, k8s, ns, release)
		svcOK := svcErr == nil && svc != nil
		svcDetail := ""
		if svcOK {
			svcDetail = victoriaLogsURLFromService(svc)
		} else {
			svcDetail = manifestErrSnippet(svcErr, 140)
		}
		checks = append(checks, IngressAddonCheck{Name: "VictoriaLogs Service", OK: svcOK, Detail: svcDetail})

		last = checks
		if stOK && svcOK {
			return IngressAddonVerification{
				OK:            true,
				CheckedAt:     time.Now().UTC().Format(time.RFC3339),
				Checks:        checks,
				WaitedSeconds: int(time.Since(started).Seconds()),
			}
		}
		select {
		case <-ctx.Done():
			deadline = time.Now()
		case <-time.After(8 * time.Second):
		}
	}
	return IngressAddonVerification{
		OK:        false,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Checks:    last,
		Issues: []string{
			"等待超时：VictoriaLogs 尚未完全就绪",
		},
		Remedies: []string{
			"kubectl get pods -n " + ns,
			"kubectl describe pod -n " + ns + " -l app.kubernetes.io/instance=" + release,
			"检查 PVC 是否已绑定、镜像是否可拉取、节点资源是否充足",
		},
		WaitedSeconds: int(time.Since(started).Seconds()),
	}
}

func VictoriaLogsAddonStatus(ctx context.Context, k8s *kubernetes.Clientset, rs *RuntimeSettings, cfg Config) gin.H {
	ns := effectiveVictoriaLogsNamespace(rs)
	release := effectiveVictoriaLogsReleaseName(rs)
	out := gin.H{
		"namespace":              ns,
		"releaseName":            release,
		"serviceName":            victoriaLogsServerServiceName(release),
		"internalUrl":            victoriaLogsInternalURL(ns, victoriaLogsServerServiceName(release), victoriaLogsServerPort),
		"runtimeUrlHint":         maskPrometheusURL(normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(rs, cfg))),
		"runtimeRetentionDays":   effectiveVictoriaLogsRetentionDays(rs),
		"installed":              false,
		"collectorReleaseName":   release + "-collector",
		"chart":                  "victoria-logs-single",
		"collectorChart":         "victoria-logs-collector",
		"collectorInstallHint":   "collector 负责采集 Kubernetes 容器日志并写入 VictoriaLogs；只部署单库时不会自动产生容器日志。",
		"datasourceBoundaryHint": "VictoriaLogs 是 LogsQL / VMLog 日志入口，不是 Prometheus 或 VictoriaMetrics vmselect。",
	}
	if k8s == nil {
		return out
	}
	if _, err := k8s.CoreV1().Namespaces().Get(ctx, ns, metav1.GetOptions{}); err != nil {
		if !apierrors.IsNotFound(err) {
			out["namespaceError"] = err.Error()
		}
		return out
	}
	out["namespaceExists"] = true
	if st, err := findVictoriaLogsStatefulSet(ctx, k8s, ns, release); err == nil && st != nil {
		want := int32(1)
		if st.Spec.Replicas != nil {
			want = *st.Spec.Replicas
		}
		out["statefulSetName"] = st.Name
		out["statefulSetReady"] = st.Status.ReadyReplicas >= want
		out["readyReplicas"] = st.Status.ReadyReplicas
		out["desiredReplicas"] = want
	}
	if svc, err := findVictoriaLogsService(ctx, k8s, ns, release); err == nil && svc != nil {
		out["serviceFound"] = true
		out["serviceName"] = svc.Name
		out["internalUrl"] = victoriaLogsURLFromService(svc)
	}
	ready, _ := out["statefulSetReady"].(bool)
	serviceFound, _ := out["serviceFound"].(bool)
	out["installed"] = ready && serviceFound
	return out
}

func PatchRuntimeVictoriaLogsURL(app *ServerApp, logsURL string, retentionDays int) error {
	logsURL = strings.TrimSpace(logsURL)
	u, err := url.Parse(logsURL)
	if err != nil || u == nil || u.Scheme == "" || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return fmt.Errorf("VictoriaLogs URL 无效")
	}
	if app == nil {
		return fmt.Errorf("应用未初始化")
	}
	cur := app.Runtime()
	if cur == nil || !cur.Initialized {
		return fmt.Errorf("动态配置尚未初始化")
	}
	next := *cur
	next.VictoriaLogsURL = normalizeVictoriaLogsBase(logsURL)
	next.VictoriaLogsRetentionDays = victoriaLogsRetentionDaysOrDefault(retentionDays)
	restoreMySQLBootstrapRuntime(&next, mysqlBootstrapConfigFrom(app.Cfg()))
	db := app.MySQLDB()
	if db == nil {
		return fmt.Errorf("MySQL 未连接，无法保存动态配置")
	}
	if err := SaveRuntimeSettingsToMySQL(db, &next); err != nil {
		return err
	}
	if err := app.Reload(); err != nil {
		return err
	}
	InvalidateRuntimeStatusCache(context.Background(), app)
	return nil
}
