package core

import (
	"strings"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestIngressAddonNamespaceFromBody(t *testing.T) {
	if got, err := ingressAddonNamespaceFromBody(k8sAddonsIngressBody{Namespace: "edge-ingress"}, nil); err != nil || got != "edge-ingress" {
		t.Fatalf("body namespace = %q err=%v", got, err)
	}
	if got, err := ingressAddonNamespaceFromBody(k8sAddonsIngressBody{}, &RuntimeSettings{IngressNginxNamespace: "runtime-ingress"}); err != nil || got != "runtime-ingress" {
		t.Fatalf("runtime namespace = %q err=%v", got, err)
	}
	if got, err := ingressAddonNamespaceFromBody(k8sAddonsIngressBody{}, nil); err != nil || got != "ingress-nginx" {
		t.Fatalf("default namespace = %q err=%v", got, err)
	}
	if _, err := ingressAddonNamespaceFromBody(k8sAddonsIngressBody{Namespace: "Bad_NS"}, nil); err == nil {
		t.Fatalf("expected invalid namespace to fail")
	}
}

func TestRewriteIngressNginxManifestForNamespace(t *testing.T) {
	raw := []byte(`
apiVersion: v1
kind: Namespace
metadata:
  name: ingress-nginx
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ingress-nginx
  namespace: ingress-nginx
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ingress-nginx
subjects:
- kind: ServiceAccount
  name: ingress-nginx
  namespace: ingress-nginx
---
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: ingress-nginx-admission
webhooks:
- name: validate.nginx.ingress.kubernetes.io
  clientConfig:
    service:
      name: ingress-nginx-controller-admission
      namespace: ingress-nginx
`)
	out, err := RewriteIngressNginxManifestForTarget(raw, IngressNginxManifestTransformOpts{Namespace: "edge-ingress"})
	if err != nil {
		t.Fatalf("rewrite manifest: %v", err)
	}
	s := string(out)
	for _, want := range []string{
		"name: edge-ingress",
		"namespace: edge-ingress",
	} {
		if !strings.Contains(s, want) {
			t.Fatalf("rewritten manifest missing %q:\n%s", want, s)
		}
	}
	if strings.Contains(s, "namespace: ingress-nginx") || strings.Contains(s, "name: ingress-nginx\n---") {
		t.Fatalf("rewritten manifest still contains old namespace:\n%s", s)
	}
}

func TestPatchIngressControllerContainerAddsDefaultResources(t *testing.T) {
	c := corev1.Container{
		Name: "controller",
		Args: []string{"--http-port=80"},
		Ports: []corev1.ContainerPort{
			{Name: "http", ContainerPort: 80},
			{Name: "https", ContainerPort: 443},
		},
	}
	patchIngressControllerContainer(&c, 8080, 8443)

	assertIngressQuantity(t, c.Resources.Requests, corev1.ResourceCPU, "100m")
	assertIngressQuantity(t, c.Resources.Requests, corev1.ResourceMemory, "128Mi")
	assertIngressQuantity(t, c.Resources.Limits, corev1.ResourceCPU, "1")
	assertIngressQuantity(t, c.Resources.Limits, corev1.ResourceMemory, "512Mi")
}

func assertIngressQuantity(t *testing.T, got corev1.ResourceList, name corev1.ResourceName, want string) {
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
