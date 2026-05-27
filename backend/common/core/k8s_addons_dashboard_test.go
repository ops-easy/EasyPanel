package core

import (
	"strings"
	"testing"
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
