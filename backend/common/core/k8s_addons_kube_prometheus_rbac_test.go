package core

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
