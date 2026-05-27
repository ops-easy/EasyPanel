package core

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"
)

func TestRewriteDashboardMonitoringManifestAddsDefaultResources(t *testing.T) {
	raw := []byte(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-server
  namespace: kube-system
spec:
  template:
    spec:
      containers:
      - name: metrics-server
        image: registry.k8s.io/metrics-server/metrics-server:v0.7.2
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kubernetes-dashboard
  namespace: kubernetes-dashboard
spec:
  template:
    spec:
      containers:
      - name: kubernetes-dashboard
        image: kubernetesui/dashboard:v2.7.0
`)
	out, err := rewriteDashboardMonitoringManifestNamespace(raw, k8sMetricsServerNamespace, k8sMetricsServerNamespace)
	if err != nil {
		t.Fatalf("rewrite manifest: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		"name: metrics-server",
		"resources:",
		"cpu: 100m",
		"memory: 200Mi",
		"name: kubernetes-dashboard",
		"cpu: 100m",
		"memory: 128Mi",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("rewritten manifest missing %q:\n%s", want, s)
		}
	}
}

func readyDashboardTestDeployment(ns, name, release string) *appsv1.Deployment {
	one := int32(1)
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:       name,
			Namespace:  ns,
			Generation: 1,
			Labels: map[string]string{
				"app.kubernetes.io/instance": release,
			},
		},
		Spec: appsv1.DeploymentSpec{Replicas: &one},
		Status: appsv1.DeploymentStatus{
			ObservedGeneration: 1,
			UpdatedReplicas:    1,
			ReadyReplicas:      1,
			AvailableReplicas:  1,
		},
	}
}

func TestK8sDashboardMonitoringStatusDetectsHelmKongRelease(t *testing.T) {
	metricsNS := "metrics-ns"
	dashboardNS := "dash-ns"
	release := "dash-ui"
	objects := []runtime.Object{
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: dashboardNS}},
		readyDashboardTestDeployment(metricsNS, k8sMetricsServerDeployment, "metrics-server"),
		readyDashboardTestDeployment(dashboardNS, release+"-kong", release),
		readyDashboardTestDeployment(dashboardNS, release+"-api", release),
		readyDashboardTestDeployment(dashboardNS, release+"-auth", release),
		readyDashboardTestDeployment(dashboardNS, release+"-web", release),
		readyDashboardTestDeployment(dashboardNS, release+"-metrics-scraper", release),
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      release + "-kong-proxy",
				Namespace: dashboardNS,
				Labels: map[string]string{
					"app.kubernetes.io/instance": release,
				},
			},
			Spec: corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "kong-proxy-tls", Port: 443}}},
		},
		&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "easypanel-dashboard-admin", Namespace: dashboardNS}},
	}
	k8s := fake.NewSimpleClientset(objects...)
	rs := &RuntimeSettings{
		MetricsServerNamespace:         metricsNS,
		KubernetesDashboardNamespace:   dashboardNS,
		KubernetesDashboardReleaseName: release,
	}

	status := K8sDashboardMonitoringStackStatus(context.Background(), k8s, rs)
	kd := status["kubernetesDashboard"].(gin.H)

	if got := kd["releaseName"]; got != release {
		t.Fatalf("releaseName = %v", got)
	}
	if got := kd["kongProxyService"]; got != release+"-kong-proxy" {
		t.Fatalf("kongProxyService = %v", got)
	}
	if got := kd["installed"]; got != true {
		t.Fatalf("installed = %v", got)
	}
	if got := kd["uiPodsLikelyReady"]; got != true {
		t.Fatalf("uiPodsLikelyReady = %v", got)
	}
	if got := kd["allComponentsReady"]; got != true {
		t.Fatalf("allComponentsReady = %v", got)
	}
	hint := kd["accessHint"].(string)
	for _, want := range []string{
		"kubectl -n " + dashboardNS + " port-forward svc/" + release + "-kong-proxy 8443:443",
		"https://localhost:8443",
		"kubectl create token easypanel-dashboard-admin -n " + dashboardNS,
	} {
		if !strings.Contains(hint, want) {
			t.Fatalf("accessHint missing %q: %s", want, hint)
		}
	}
}

func TestWaitVerifyK8sDashboardMonitoringStackChecksKongProxyForCustomRelease(t *testing.T) {
	metricsNS := "metrics-ns"
	dashboardNS := "dash-ns"
	release := "dash-ui"
	k8s := fake.NewSimpleClientset(
		readyDashboardTestDeployment(metricsNS, k8sMetricsServerDeployment, "metrics-server"),
		readyDashboardTestDeployment(dashboardNS, release+"-kong", release),
		readyDashboardTestDeployment(dashboardNS, release+"-api", release),
		readyDashboardTestDeployment(dashboardNS, release+"-auth", release),
		readyDashboardTestDeployment(dashboardNS, release+"-web", release),
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      release + "-kong-proxy",
				Namespace: dashboardNS,
				Labels:    map[string]string{"app.kubernetes.io/instance": release},
			},
			Spec: corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "kong-proxy-tls", Port: 443}}},
		},
		&corev1.ServiceAccount{ObjectMeta: metav1.ObjectMeta{Name: "easypanel-dashboard-admin", Namespace: dashboardNS}},
	)

	verification := WaitVerifyK8sDashboardMonitoringStack(context.Background(), k8s, metricsNS, dashboardNS, release, time.Millisecond, 50*time.Millisecond)
	if !verification.OK {
		t.Fatalf("verification should pass, got issues=%v checks=%+v", verification.Issues, verification.Checks)
	}
	names := make([]string, 0, len(verification.Checks))
	for _, check := range verification.Checks {
		names = append(names, check.Name)
	}
	joined := strings.Join(names, "\n")
	for _, want := range []string{
		"Dashboard Kong Deployment",
		"Dashboard API Deployment",
		"Dashboard Auth Deployment",
		"Dashboard Web Deployment",
		"Dashboard Kong proxy Service",
	} {
		if !strings.Contains(joined, want) {
			t.Fatalf("verification checks missing %q in %v", want, names)
		}
	}
}
