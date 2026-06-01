package core

import (
	"os"
	"strings"
	"testing"
)

func TestK8sApplyYamlFallsBackToDynamicApplyForArbitraryKinds(t *testing.T) {
	data, err := os.ReadFile("k8s_apply_delete.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	if !strings.Contains(source, "applyYAMLManifestDynamic(ctx, restCfg, []byte(doc))") {
		t.Fatalf("k8s apply-yaml should fall back to dynamic server-side apply for kinds outside the typed fast path")
	}
	if strings.Contains(source, "暂不"+"支持的 kind") {
		t.Fatalf("k8s apply-yaml should not send users back to kubectl for otherwise valid Kubernetes kinds")
	}
	if !strings.Contains(source, "app.K8sREST()") {
		t.Fatalf("k8s apply-yaml handler should pass REST config so dynamic apply can resolve arbitrary resources")
	}
}
