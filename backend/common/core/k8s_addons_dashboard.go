package core

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	sigyaml "sigs.k8s.io/yaml"
)

const (
	k8sMetricsServerComponentsURL     = "https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml"
	k8sKubernetesDashboardHelmRepoURL = "https://kubernetes.github.io/dashboard/"
	k8sKubernetesDashboardChartRef    = "kubernetes-dashboard/kubernetes-dashboard"

	k8sMetricsServerDeployment   = "metrics-server"
	k8sMetricsServerNamespace    = "kube-system"
	k8sKubernetesDashboardNS     = "kubernetes-dashboard"
	k8sDashboardAdminBindingYAML = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: easypanel-dashboard-admin
  namespace: kubernetes-dashboard
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: easypanel-dashboard-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-admin
subjects:
- kind: ServiceAccount
  name: easypanel-dashboard-admin
  namespace: kubernetes-dashboard
`
)

func k8sDashboardAdminBindingYAMLForNamespace(namespace string) []byte {
	namespace = firstValidAddonNamespace(namespace, k8sKubernetesDashboardNS)
	return []byte(strings.ReplaceAll(k8sDashboardAdminBindingYAML, "namespace: kubernetes-dashboard", "namespace: "+namespace))
}

// RewriteK8sDashboardMonitoringAddonImages 将 metrics-server（registry.k8s.io）与 Dashboard（kubernetesui/*）改写为国内可拉取前缀。
// 与 ingress 一致：若 IngressNginxSkipK8sRegistryMirror 则不改写。
func RewriteK8sDashboardMonitoringAddonImages(raw []byte, cfg Config) []byte {
	if cfg.IngressNginxSkipK8sRegistryMirror {
		return raw
	}
	b := RewriteIngressManifestK8sRegistryImages(raw, cfg)
	prefix := strings.TrimSuffix(strings.TrimSpace(cfg.IngressNginxK8sImageMirrorPrefix), "/")
	if prefix == "" {
		prefix = "m.daocloud.io/docker.io"
	}
	return rewriteKubernetesUIImageToMirror(b, prefix)
}

func rewriteKubernetesUIImageToMirror(manifest []byte, dockerMirrorPrefix string) []byte {
	if dockerMirrorPrefix == "" {
		return manifest
	}
	s := string(manifest)
	mp := strings.TrimSuffix(dockerMirrorPrefix, "/")
	s = strings.ReplaceAll(s, "image: kubernetesui/", "image: "+mp+"/kubernetesui/")
	s = strings.ReplaceAll(s, "image: docker.io/kubernetesui/", "image: "+mp+"/kubernetesui/")
	return []byte(s)
}

func dashboardMonitoringNamespacedKind(kind string) bool {
	switch kind {
	case "ConfigMap", "Deployment", "Role", "RoleBinding", "Secret", "Service", "ServiceAccount":
		return true
	default:
		return false
	}
}

func byteSlicesToStrings(parts [][]byte) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, string(p))
	}
	return out
}

type dashboardMonitoringResourceDefaults struct {
	cpuRequest    string
	memoryRequest string
	cpuLimit      string
	memoryLimit   string
}

func dashboardMonitoringResourceDefaultsFor(deploymentName, containerName string) (dashboardMonitoringResourceDefaults, bool) {
	deploymentName = strings.TrimSpace(deploymentName)
	containerName = strings.TrimSpace(containerName)
	switch deploymentName {
	case k8sMetricsServerDeployment:
		if containerName == "" || containerName == "metrics-server" {
			return dashboardMonitoringResourceDefaults{"100m", "200Mi", "500m", "512Mi"}, true
		}
	case "kubernetes-dashboard":
		if containerName == "" || containerName == "kubernetes-dashboard" {
			return dashboardMonitoringResourceDefaults{"100m", "128Mi", "500m", "256Mi"}, true
		}
	case "dashboard-metrics-scraper":
		if containerName == "" || containerName == "dashboard-metrics-scraper" {
			return dashboardMonitoringResourceDefaults{"50m", "64Mi", "200m", "128Mi"}, true
		}
	}
	return dashboardMonitoringResourceDefaults{}, false
}

func ensureStringMapField(parent map[string]any, key string) map[string]any {
	m, ok := parent[key].(map[string]any)
	if !ok || m == nil {
		m = map[string]any{}
		parent[key] = m
	}
	return m
}

func setStringIfMissing(m map[string]any, key, value string) bool {
	if strings.TrimSpace(value) == "" {
		return false
	}
	if _, ok := m[key]; ok {
		return false
	}
	m[key] = value
	return true
}

func patchDashboardMonitoringContainerResources(container map[string]any, defaults dashboardMonitoringResourceDefaults) bool {
	resources := ensureStringMapField(container, "resources")
	requests := ensureStringMapField(resources, "requests")
	limits := ensureStringMapField(resources, "limits")
	changed := false
	changed = setStringIfMissing(requests, "cpu", defaults.cpuRequest) || changed
	changed = setStringIfMissing(requests, "memory", defaults.memoryRequest) || changed
	changed = setStringIfMissing(limits, "cpu", defaults.cpuLimit) || changed
	changed = setStringIfMissing(limits, "memory", defaults.memoryLimit) || changed
	return changed
}

func patchDashboardMonitoringDeploymentResources(obj *unstructured.Unstructured) {
	if obj == nil || obj.GetKind() != "Deployment" {
		return
	}
	containers, ok, _ := unstructured.NestedSlice(obj.Object, "spec", "template", "spec", "containers")
	if !ok {
		return
	}
	changed := false
	for i := range containers {
		container, ok := containers[i].(map[string]any)
		if !ok || container == nil {
			continue
		}
		name, _ := container["name"].(string)
		defaults, ok := dashboardMonitoringResourceDefaultsFor(obj.GetName(), name)
		if !ok {
			continue
		}
		if patchDashboardMonitoringContainerResources(container, defaults) {
			containers[i] = container
			changed = true
		}
	}
	if changed {
		_ = unstructured.SetNestedSlice(obj.Object, containers, "spec", "template", "spec", "containers")
	}
}

func rewriteDashboardMonitoringManifestNamespace(raw []byte, fromNamespace, toNamespace string) ([]byte, error) {
	toNamespace = strings.TrimSpace(toNamespace)
	rewriteNamespace := toNamespace != "" && toNamespace != fromNamespace
	var out [][]byte
	for _, doc := range splitYAMLDocuments(string(raw)) {
		if len(strings.TrimSpace(string(doc))) == 0 {
			continue
		}
		jsonDoc, err := sigyaml.YAMLToJSON([]byte(doc))
		if err != nil {
			return nil, fmt.Errorf("解析 YAML: %w", err)
		}
		obj := &unstructured.Unstructured{}
		if err := obj.UnmarshalJSON(jsonDoc); err != nil {
			return nil, fmt.Errorf("解析 Kubernetes 对象: %w", err)
		}
		switch obj.GetKind() {
		case "Namespace":
			if rewriteNamespace && obj.GetName() == fromNamespace {
				obj.SetName(toNamespace)
			}
		case "ClusterRoleBinding":
			subjects, ok, _ := unstructured.NestedSlice(obj.Object, "subjects")
			if rewriteNamespace && ok {
				for i := range subjects {
					m, _ := subjects[i].(map[string]any)
					if m == nil || m["kind"] != "ServiceAccount" {
						continue
					}
					if ns, _ := m["namespace"].(string); ns == fromNamespace || ns == "" {
						m["namespace"] = toNamespace
					}
				}
				_ = unstructured.SetNestedSlice(obj.Object, subjects, "subjects")
			}
		default:
			if rewriteNamespace && dashboardMonitoringNamespacedKind(obj.GetKind()) {
				if obj.GetNamespace() == "" || obj.GetNamespace() == fromNamespace {
					obj.SetNamespace(toNamespace)
				}
			}
		}
		patchDashboardMonitoringDeploymentResources(obj)
		b, err := sigyaml.Marshal(obj.Object)
		if err != nil {
			return nil, fmt.Errorf("渲染 YAML: %w", err)
		}
		out = append(out, b)
	}
	return []byte(strings.Join(byteSlicesToStrings(out), "\n---\n")), nil
}

func patchMetricsServerKubeletInsecureTLS(ctx context.Context, k8s *kubernetes.Clientset, namespace string) error {
	if k8s == nil {
		return fmt.Errorf("Kubernetes 客户端未初始化")
	}
	namespace = firstValidAddonNamespace(namespace, k8sMetricsServerNamespace)
	waitCtx, cancel := context.WithTimeout(ctx, 4*time.Minute)
	defer cancel()
	for {
		dep, err := k8s.AppsV1().Deployments(namespace).Get(waitCtx, k8sMetricsServerDeployment, metav1.GetOptions{})
		if err != nil {
			if apierrors.IsNotFound(err) {
				select {
				case <-waitCtx.Done():
					return fmt.Errorf("等待 metrics-server Deployment: %w", waitCtx.Err())
				case <-time.After(2 * time.Second):
				}
				continue
			}
			return fmt.Errorf("读取 metrics-server Deployment: %w", err)
		}
		changed := false
		for i := range dep.Spec.Template.Spec.Containers {
			c := &dep.Spec.Template.Spec.Containers[i]
			if len(dep.Spec.Template.Spec.Containers) > 1 && c.Name != "metrics-server" {
				continue
			}
			has := false
			for _, a := range c.Args {
				if a == "--kubelet-insecure-tls" || strings.HasPrefix(a, "--kubelet-insecure-tls=") {
					has = true
					break
				}
			}
			if !has {
				c.Args = append(c.Args, "--kubelet-insecure-tls")
				changed = true
			}
		}
		if !changed {
			return nil
		}
		_, err = k8s.AppsV1().Deployments(namespace).Update(waitCtx, dep, metav1.UpdateOptions{})
		if err == nil {
			return nil
		}
		if !apierrors.IsConflict(err) {
			return fmt.Errorf("更新 metrics-server Deployment: %w", err)
		}
		select {
		case <-waitCtx.Done():
			return fmt.Errorf("更新 metrics-server: %w", waitCtx.Err())
		case <-time.After(2 * time.Second):
		}
	}
}

func helmTemplateKubernetesDashboardChart(ctx context.Context, helmBin, workDir, releaseName, namespace string) ([]byte, error) {
	repo := exec.CommandContext(ctx, helmBin, "repo", "add", "kubernetes-dashboard", k8sKubernetesDashboardHelmRepoURL)
	repo.Env = helmHelmEnv(workDir)
	repo.Dir = workDir
	if out, err := repo.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("helm repo add kubernetes-dashboard 失败: %w\noutput=%s", err, string(out))
	}
	cmd := exec.CommandContext(ctx, helmBin, "template", releaseName, k8sKubernetesDashboardChartRef,
		"--namespace", namespace,
	)
	cmd.Env = helmHelmEnv(workDir)
	cmd.Dir = workDir
	out, err := cmd.Output()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("helm template %s 失败: %w\nstderr=%s", k8sKubernetesDashboardChartRef, err, string(ee.Stderr))
		}
		return nil, fmt.Errorf("helm template %s: %w", k8sKubernetesDashboardChartRef, err)
	}
	return out, nil
}

// InstallK8sDashboardMonitoringStack 安装 metrics-server + Kubernetes Dashboard Helm chart + 平台创建的 cluster-admin ServiceAccount（登录用 Token）。
func InstallK8sDashboardMonitoringStack(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, platformCfg Config, mirror ManifestMirrorMode, metricsServerNamespace, dashboardNamespace, dashboardReleaseName string, kubeletInsecureTLS bool) error {
	if k8s == nil || restCfg == nil {
		return fmt.Errorf("Kubernetes 未连接")
	}
	metricsServerNamespace = firstValidAddonNamespace(metricsServerNamespace, k8sMetricsServerNamespace)
	dashboardNamespace = firstValidAddonNamespace(dashboardNamespace, k8sKubernetesDashboardNS)
	dashboardReleaseName = firstValidAddonReleaseName(dashboardReleaseName, k8sKubernetesDashboardNS)
	msRaw, err := httpGetManifestBytes(ctx, k8sMetricsServerComponentsURL, mirror)
	if err != nil {
		return fmt.Errorf("下载 metrics-server 清单: %w", err)
	}
	msRaw = RewriteK8sDashboardMonitoringAddonImages(msRaw, platformCfg)
	msRaw, err = rewriteDashboardMonitoringManifestNamespace(msRaw, k8sMetricsServerNamespace, metricsServerNamespace)
	if err != nil {
		return fmt.Errorf("改写 metrics-server namespace: %w", err)
	}
	if err := applyYAMLManifestDynamic(ctx, restCfg, msRaw); err != nil {
		return fmt.Errorf("应用 metrics-server: %w", err)
	}
	if kubeletInsecureTLS {
		if err := patchMetricsServerKubeletInsecureTLS(ctx, k8s, metricsServerNamespace); err != nil {
			return err
		}
	}
	helmBin, err := resolveHelmBinary()
	if err != nil {
		return fmt.Errorf("未找到 helm 可执行文件：请在镜像内放置 /app/helm，或设置 HELM_BIN，或将 helm 加入 PATH: %w", err)
	}
	workDir, err := os.MkdirTemp("", "easypanel-k8s-dashboard-*")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(workDir) }()
	if err := ensureNamespace(ctx, k8s, dashboardNamespace); err != nil {
		return fmt.Errorf("创建或确认命名空间 %s: %w", dashboardNamespace, err)
	}
	rendered, err := helmTemplateKubernetesDashboardChart(ctx, helmBin, workDir, dashboardReleaseName, dashboardNamespace)
	if err != nil {
		return err
	}
	if !platformCfg.IngressNginxSkipK8sRegistryMirror {
		rendered = RewriteKubePrometheusRenderedImages(rendered)
	}
	if err := applyYAMLManifestDynamic(ctx, restCfg, rendered); err != nil {
		return fmt.Errorf("应用 kubernetes-dashboard Helm 渲染清单: %w", err)
	}
	if err := applyYAMLManifestDynamic(ctx, restCfg, k8sDashboardAdminBindingYAMLForNamespace(dashboardNamespace)); err != nil {
		return fmt.Errorf("应用 Dashboard 管理员 ServiceAccount: %w", err)
	}
	return nil
}

func deploymentStatusBrief(ctx context.Context, k8s kubernetes.Interface, ns, name string) gin.H {
	out := gin.H{
		"namespace":       ns,
		"name":            name,
		"found":           false,
		"readyReplicas":   int32(0),
		"desiredReplicas": int32(0),
		"rolloutReady":    false,
	}
	if k8s == nil {
		return out
	}
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		if !apierrors.IsNotFound(err) {
			out["error"] = err.Error()
		}
		return out
	}
	out["found"] = true
	want := int32(1)
	if dep.Spec.Replicas != nil {
		want = *dep.Spec.Replicas
	}
	out["desiredReplicas"] = want
	out["readyReplicas"] = dep.Status.ReadyReplicas
	out["rolloutReady"] = deploymentRolloutLooksReady(dep)
	return out
}

type kubernetesDashboardHelmDeployment struct {
	Key      string
	Label    string
	Suffix   string
	Optional bool
}

var kubernetesDashboardHelmDeployments = []kubernetesDashboardHelmDeployment{
	{Key: "kongDeployment", Label: "Dashboard Kong Deployment", Suffix: "kong"},
	{Key: "apiDeployment", Label: "Dashboard API Deployment", Suffix: "api"},
	{Key: "authDeployment", Label: "Dashboard Auth Deployment", Suffix: "auth"},
	{Key: "webDeployment", Label: "Dashboard Web Deployment", Suffix: "web"},
	{Key: "metricsScraperDeployment", Label: "Dashboard metrics-scraper Deployment", Suffix: "metrics-scraper", Optional: true},
}

func kubernetesDashboardHelmDeploymentName(releaseName, suffix string) string {
	releaseName = firstValidAddonReleaseName(releaseName, k8sKubernetesDashboardNS)
	return releaseName + "-" + suffix
}

func kubernetesDashboardKongProxyServiceName(releaseName string) string {
	releaseName = firstValidAddonReleaseName(releaseName, k8sKubernetesDashboardNS)
	return releaseName + "-kong-proxy"
}

func dashboardComponentMatchesSuffix(dep appsv1.Deployment, suffix string) bool {
	suffix = strings.ToLower(strings.TrimSpace(suffix))
	name := strings.ToLower(dep.Name)
	if strings.HasSuffix(name, "-"+suffix) || strings.Contains(name, "-"+suffix+"-") {
		return true
	}
	for _, key := range []string{"app.kubernetes.io/name", "app.kubernetes.io/component", "app", "k8s-app"} {
		v := strings.ToLower(strings.TrimSpace(dep.Labels[key]))
		if v == suffix || strings.HasSuffix(v, "-"+suffix) || strings.Contains(v, suffix) {
			return true
		}
	}
	return false
}

func findKubernetesDashboardDeployment(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName, suffix string) (*appsv1.Deployment, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	releaseName = firstValidAddonReleaseName(releaseName, k8sKubernetesDashboardNS)
	exact := kubernetesDashboardHelmDeploymentName(releaseName, suffix)
	if dep, err := k8s.AppsV1().Deployments(namespace).Get(ctx, exact, metav1.GetOptions{}); err == nil && dep != nil {
		return dep, nil
	} else if err != nil && !apierrors.IsNotFound(err) {
		return nil, err
	}
	list, err := k8s.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/instance=" + releaseName,
	})
	if err != nil {
		return nil, err
	}
	for i := range list.Items {
		dep := &list.Items[i]
		if dashboardComponentMatchesSuffix(*dep, suffix) {
			return dep, nil
		}
	}
	return nil, apierrors.NewNotFound(schema.GroupResource{Group: "apps", Resource: "deployments"}, exact)
}

func dashboardDeploymentStatusBySuffix(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName, suffix string) gin.H {
	out := gin.H{
		"namespace":       namespace,
		"name":            kubernetesDashboardHelmDeploymentName(releaseName, suffix),
		"found":           false,
		"readyReplicas":   int32(0),
		"desiredReplicas": int32(0),
		"rolloutReady":    false,
	}
	dep, err := findKubernetesDashboardDeployment(ctx, k8s, namespace, releaseName, suffix)
	if err != nil {
		if !apierrors.IsNotFound(err) {
			out["error"] = err.Error()
		}
		return out
	}
	out["name"] = dep.Name
	out["found"] = true
	want := deploymentReplicasDesired(dep)
	out["desiredReplicas"] = want
	out["readyReplicas"] = dep.Status.ReadyReplicas
	out["rolloutReady"] = deploymentRolloutLooksReady(dep)
	return out
}

func findKubernetesDashboardKongProxyService(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName string) (*corev1.Service, error) {
	if k8s == nil {
		return nil, fmt.Errorf("k8s 为空")
	}
	releaseName = firstValidAddonReleaseName(releaseName, k8sKubernetesDashboardNS)
	exact := kubernetesDashboardKongProxyServiceName(releaseName)
	if svc, err := k8s.CoreV1().Services(namespace).Get(ctx, exact, metav1.GetOptions{}); err == nil && svc != nil {
		return svc, nil
	} else if err != nil && !apierrors.IsNotFound(err) {
		return nil, err
	}
	list, err := k8s.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: "app.kubernetes.io/instance=" + releaseName,
	})
	if err != nil {
		return nil, err
	}
	for i := range list.Items {
		svc := &list.Items[i]
		name := strings.ToLower(svc.Name)
		if strings.Contains(name, "kong") && strings.Contains(name, "proxy") {
			return svc, nil
		}
	}
	return nil, apierrors.NewNotFound(schema.GroupResource{Resource: "services"}, exact)
}

func dashboardKongProxyServiceStatus(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName string) gin.H {
	out := gin.H{
		"namespace": namespace,
		"name":      kubernetesDashboardKongProxyServiceName(releaseName),
		"found":     false,
	}
	svc, err := findKubernetesDashboardKongProxyService(ctx, k8s, namespace, releaseName)
	if err != nil {
		if !apierrors.IsNotFound(err) {
			out["error"] = err.Error()
		}
		return out
	}
	out["name"] = svc.Name
	out["found"] = true
	if len(svc.Spec.Ports) > 0 {
		out["port"] = svc.Spec.Ports[0].Port
		out["portName"] = svc.Spec.Ports[0].Name
	}
	return out
}

func dashboardAccessHint(namespace, releaseName, serviceName string) string {
	namespace = firstValidAddonNamespace(namespace, k8sKubernetesDashboardNS)
	releaseName = firstValidAddonReleaseName(releaseName, k8sKubernetesDashboardNS)
	serviceName = strings.TrimSpace(serviceName)
	if serviceName == "" {
		serviceName = kubernetesDashboardKongProxyServiceName(releaseName)
	}
	return "kubectl -n " + namespace + " port-forward svc/" + serviceName + " 8443:443 后访问 https://localhost:8443；登录用 kubectl create token easypanel-dashboard-admin -n " + namespace + " --duration=24h"
}

func PatchRuntimeDashboardMonitoringTarget(app *ServerApp, metricsNamespace, dashboardNamespace, dashboardReleaseName string) error {
	metricsNamespace = strings.TrimSpace(metricsNamespace)
	if err := validateK8sAddonNamespace(metricsNamespace); err != nil {
		return fmt.Errorf("metricsServerNamespace 无效: %w", err)
	}
	dashboardNamespace = strings.TrimSpace(dashboardNamespace)
	if err := validateK8sAddonNamespace(dashboardNamespace); err != nil {
		return fmt.Errorf("dashboardNamespace 无效: %w", err)
	}
	dashboardReleaseName = strings.TrimSpace(dashboardReleaseName)
	if err := validateK8sAddonReleaseName(dashboardReleaseName); err != nil {
		return fmt.Errorf("dashboardReleaseName 无效: %w", err)
	}
	if app == nil {
		return fmt.Errorf("应用未初始化")
	}
	cur := app.Runtime()
	if cur == nil || !cur.Initialized {
		return fmt.Errorf("动态配置尚未初始化")
	}
	next := *cur
	next.MetricsServerNamespace = metricsNamespace
	next.KubernetesDashboardNamespace = dashboardNamespace
	next.KubernetesDashboardReleaseName = dashboardReleaseName
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

// K8sDashboardMonitoringStackStatus 供 /api/k8s/addons/status 合并展示。
func K8sDashboardMonitoringStackStatus(ctx context.Context, k8s kubernetes.Interface, rs *RuntimeSettings) gin.H {
	metricsNS := effectiveMetricsServerNamespace(rs)
	dashboardNS := effectiveKubernetesDashboardNamespace(rs)
	dashboardRelease := effectiveKubernetesDashboardReleaseName(rs)
	if k8s == nil {
		return gin.H{
			"metricsServer": gin.H{
				"namespace": metricsNS,
				"installed": false,
			},
			"kubernetesDashboard": gin.H{
				"namespace":   dashboardNS,
				"releaseName": dashboardRelease,
				"installed":   false,
			},
		}
	}
	msDep := deploymentStatusBrief(ctx, k8s, metricsNS, k8sMetricsServerDeployment)
	msInstalled, _ := msDep["found"].(bool)
	msRollout, _ := msDep["rolloutReady"].(bool)

	dashboardDeployments := gin.H{}
	helmFoundAny := false
	helmRequiredReady := true
	helmRequiredFound := true
	for _, component := range kubernetesDashboardHelmDeployments {
		st := dashboardDeploymentStatusBySuffix(ctx, k8s, dashboardNS, dashboardRelease, component.Suffix)
		dashboardDeployments[component.Key] = st
		found, _ := st["found"].(bool)
		ready, _ := st["rolloutReady"].(bool)
		if found {
			helmFoundAny = true
		}
		if !component.Optional {
			if !found {
				helmRequiredFound = false
			}
			if !ready {
				helmRequiredReady = false
			}
		}
	}
	kongService := dashboardKongProxyServiceStatus(ctx, k8s, dashboardNS, dashboardRelease)
	kongServiceFound, _ := kongService["found"].(bool)
	kongServiceName, _ := kongService["name"].(string)

	nsExists := false
	if _, err := k8s.CoreV1().Namespaces().Get(ctx, dashboardNS, metav1.GetOptions{}); err == nil {
		nsExists = true
	}

	saExists := false
	if _, err := k8s.CoreV1().ServiceAccounts(dashboardNS).Get(ctx, "easypanel-dashboard-admin", metav1.GetOptions{}); err == nil {
		saExists = true
	}

	dashboardLikely := nsExists && (helmFoundAny || kongServiceFound)
	dashboardReady := helmRequiredFound && helmRequiredReady && kongServiceFound
	allReady := msInstalled && msRollout && dashboardReady

	return gin.H{
		"metricsServer": gin.H{
			"namespace":              metricsNS,
			"deployment":             msDep,
			"installed":              msInstalled,
			"rolloutReady":           msRollout,
			"kubeletInsecureTlsHint": "多数国内/自签 kubelet 证书环境需为 metrics-server 增加参数 --kubelet-insecure-tls；一键安装默认可勾选注入。",
		},
		"kubernetesDashboard": gin.H{
			"namespace":                dashboardNS,
			"releaseName":              dashboardRelease,
			"namespaceExists":          nsExists,
			"dashboardDeployment":      dashboardDeployments["webDeployment"],
			"scraperDeployment":        dashboardDeployments["metricsScraperDeployment"],
			"kongDeployment":           dashboardDeployments["kongDeployment"],
			"apiDeployment":            dashboardDeployments["apiDeployment"],
			"authDeployment":           dashboardDeployments["authDeployment"],
			"webDeployment":            dashboardDeployments["webDeployment"],
			"metricsScraperDeployment": dashboardDeployments["metricsScraperDeployment"],
			"kongProxyService":         kongServiceName,
			"kongProxyServiceStatus":   kongService,
			"installed":                dashboardLikely,
			"uiPodsLikelyReady":        dashboardReady,
			"adminServiceAccount":      "easypanel-dashboard-admin",
			"adminBindingInstalled":    saExists,
			"helmChart":                k8sKubernetesDashboardChartRef,
			"accessHint":               dashboardAccessHint(dashboardNS, dashboardRelease, kongServiceName),
			"allComponentsReady":       allReady,
		},
	}
}

func dashboardDeploymentCheck(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName string, component kubernetesDashboardHelmDeployment) IngressAddonCheck {
	dep, err := findKubernetesDashboardDeployment(ctx, k8s, namespace, releaseName, component.Suffix)
	if err != nil || dep == nil {
		if component.Optional && apierrors.IsNotFound(err) {
			return IngressAddonCheck{Name: component.Label, OK: true, Detail: "未安装/未启用（可忽略）"}
		}
		return IngressAddonCheck{Name: component.Label, OK: false, Detail: manifestErrSnippet(err, 120)}
	}
	ok := deploymentRolloutLooksReady(dep)
	detail := fmt.Sprintf("%s ready %d/%d", dep.Name, dep.Status.ReadyReplicas, deploymentReplicasDesired(dep))
	return IngressAddonCheck{Name: component.Label, OK: ok, Detail: detail}
}

func dashboardKongProxyServiceCheck(ctx context.Context, k8s kubernetes.Interface, namespace, releaseName string) IngressAddonCheck {
	svc, err := findKubernetesDashboardKongProxyService(ctx, k8s, namespace, releaseName)
	if err != nil || svc == nil {
		return IngressAddonCheck{Name: "Dashboard Kong proxy Service", OK: false, Detail: manifestErrSnippet(err, 120)}
	}
	return IngressAddonCheck{Name: "Dashboard Kong proxy Service", OK: true, Detail: "svc/" + svc.Name}
}

// WaitVerifyK8sDashboardMonitoringStack 安装后轮询 metrics-server 与 Dashboard Helm/Kong 组件就绪。
func WaitVerifyK8sDashboardMonitoringStack(ctx context.Context, k8s kubernetes.Interface, metricsServerNamespace, dashboardNamespace, dashboardReleaseName string, pollEvery time.Duration, maxWait time.Duration) IngressAddonVerification {
	started := time.Now()
	if k8s == nil {
		return IngressAddonVerification{
			OK:        false,
			CheckedAt: time.Now().UTC().Format(time.RFC3339),
			Issues:    []string{"Kubernetes 客户端不可用"},
			Remedies:  []string{"确认集群已连接并具有 apps deployments 读权限"},
		}
	}
	metricsServerNamespace = firstValidAddonNamespace(metricsServerNamespace, k8sMetricsServerNamespace)
	dashboardNamespace = firstValidAddonNamespace(dashboardNamespace, k8sKubernetesDashboardNS)
	dashboardReleaseName = firstValidAddonReleaseName(dashboardReleaseName, k8sKubernetesDashboardNS)
	deadline := time.Now().Add(maxWait)
	var lastChecks []IngressAddonCheck
	for time.Now().Before(deadline) {
		if ctx.Err() != nil {
			break
		}
		var checks []IngressAddonCheck
		msDep, err := k8s.AppsV1().Deployments(metricsServerNamespace).Get(ctx, k8sMetricsServerDeployment, metav1.GetOptions{})
		if err != nil || msDep == nil {
			checks = append(checks, IngressAddonCheck{Name: "metrics-server Deployment", OK: false, Detail: manifestErrSnippet(err, 120)})
		} else {
			ok := deploymentRolloutLooksReady(msDep)
			detail := fmt.Sprintf("ready %d/%d", msDep.Status.ReadyReplicas, deploymentReplicasDesired(msDep))
			checks = append(checks, IngressAddonCheck{Name: "metrics-server Deployment", OK: ok, Detail: detail})
		}

		for _, component := range kubernetesDashboardHelmDeployments {
			checks = append(checks, dashboardDeploymentCheck(ctx, k8s, dashboardNamespace, dashboardReleaseName, component))
		}
		checks = append(checks, dashboardKongProxyServiceCheck(ctx, k8s, dashboardNamespace, dashboardReleaseName))

		_, err = k8s.CoreV1().ServiceAccounts(dashboardNamespace).Get(ctx, "easypanel-dashboard-admin", metav1.GetOptions{})
		saOk := err == nil
		checks = append(checks, IngressAddonCheck{Name: "SA easypanel-dashboard-admin", OK: saOk, Detail: func() string {
			if saOk {
				return "已创建"
			}
			return manifestErrSnippet(err, 120)
		}()})

		lastChecks = checks
		allOK := true
		for _, c := range checks {
			if !c.OK {
				allOK = false
				break
			}
		}
		if allOK {
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
		case <-time.After(pollEvery):
		}
	}

	issues := []string{"等待超时：部分组件未就绪"}
	remedies := []string{
		"查看 Pod 事件：kubectl describe pod -n " + metricsServerNamespace + " -l k8s-app=metrics-server ；kubectl describe pod -n " + dashboardNamespace + " -l app.kubernetes.io/instance=" + dashboardReleaseName,
		"确认 Kong 入口 Service：kubectl get svc -n " + dashboardNamespace + " " + kubernetesDashboardKongProxyServiceName(dashboardReleaseName),
		"若 metrics-server 因 kubelet 证书报错，编辑 Deployment 增加参数 --kubelet-insecure-tls 后重试",
		"确认节点可拉取 DaoCloud 改写后的镜像；若禁用镜像改写，请在运行时设置 INGRESS_NGINX_SKIP_K8S_REGISTRY_MIRROR 并改用自建镜像仓库",
	}
	return IngressAddonVerification{
		OK:            false,
		CheckedAt:     time.Now().UTC().Format(time.RFC3339),
		Checks:        lastChecks,
		Issues:        issues,
		Remedies:      remedies,
		WaitedSeconds: int(time.Since(started).Seconds()),
	}
}
