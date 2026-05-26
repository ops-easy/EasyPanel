package core

import (
	"strings"
	"testing"
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
