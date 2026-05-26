package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestPrometheusServiceNameCandidatesIncludeHelmChartVariants(t *testing.T) {
	candidates := prometheusServiceNameCandidates("kbt-prom")
	for _, want := range []string{
		"kbt-prom-kube-prometheus-stack-prometheus",
		"kbt-prom-kube-prometheus-s-prometheus",
		"kbt-prom-kube-prometheus-prometheus",
		"prometheus-kbt-prom-kube-prometheus-stack-prometheus",
		"prometheus-kbt-prom-kube-prometheus-s-prometheus",
		"prometheus-operated",
	} {
		found := false
		for _, got := range candidates {
			if got == want {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("candidates missing %q: %#v", want, candidates)
		}
	}
}

func TestPickPrometheusServiceAcceptsHelmTruncatedStackName(t *testing.T) {
	services := []corev1.Service{
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "kbt-prom-grafana",
				Namespace: kubePromStackNamespace,
				Labels: map[string]string{
					"app.kubernetes.io/instance": "kbt-prom",
					"app.kubernetes.io/name":     "grafana",
				},
			},
			Spec: corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "service", Port: 80}}},
		},
		{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "kbt-prom-kube-prometheus-s-prometheus",
				Namespace: kubePromStackNamespace,
				Labels: map[string]string{
					"app.kubernetes.io/instance": "kbt-prom",
					"app.kubernetes.io/name":     "kube-prometheus-stack-prometheus",
				},
			},
			Spec: corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "http-web", Port: 9090}}},
		},
	}

	svc := pickPrometheusService(services, "kbt-prom")
	if svc == nil {
		t.Fatal("pickPrometheusService returned nil")
	}
	if svc.Name != "kbt-prom-kube-prometheus-s-prometheus" {
		t.Fatalf("service name = %q", svc.Name)
	}
}

func TestFriendlyKubePrometheusInstallErrorExplainsRBACEscalation(t *testing.T) {
	err := fmt.Errorf(`应用 kube-prometheus-stack 渲染清单: 文档 #27: Apply ClusterRole /kbt-prom-kube-prometheus-s-operator: clusterroles.rbac.authorization.k8s.io "kbt-prom-kube-prometheus-s-operator" is forbidden: user "system:serviceaccount:easy:easypanel" is attempting to grant RBAC permissions not currently held`)

	msg := FriendlyKubePrometheusStackInstallError(err)

	for _, want := range []string{
		"kube-prometheus-stack 需要 EasyPanel 具备集群管理员级 RBAC 安装权限",
		"bind/escalate",
		"kubectl create clusterrolebinding",
		"--clusterrole=cluster-admin",
		"--serviceaccount=",
	} {
		if !strings.Contains(msg, want) {
			t.Fatalf("friendly error missing %q:\n%s", want, msg)
		}
	}
}

func TestEasyPanelFullRBACGrantsAddonInstallerPrivileges(t *testing.T) {
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, rel := range []string{
		filepath.Join("k8s", "backend", "rbac.yaml"),
		filepath.Join("k8s", "charts", "easypanel", "templates", "rbac.yaml"),
	} {
		raw, err := os.ReadFile(filepath.Join(root, rel))
		if err != nil {
			t.Fatalf("read %s: %v", rel, err)
		}
		text := string(raw)
		for _, want := range []string{
			`apiGroups: ["*"]`,
			`resources: ["*"]`,
			`verbs: ["*"]`,
			`nonResourceURLs: ["*"]`,
		} {
			if !strings.Contains(text, want) {
				t.Fatalf("%s missing %q", rel, want)
			}
		}
	}
}
