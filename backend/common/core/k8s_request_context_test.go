package core

import (
	"os"
	"strings"
	"testing"
)

func TestK8sHTTPHandlersUseRequestScopedContexts(t *testing.T) {
	files := []string{
		"web.go",
		"k8s_apply_delete.go",
		"k8s_cluster_handlers.go",
		"k8s_namespace_stats.go",
		"k8s_object_json.go",
		"k8s_object_revision_handlers.go",
		"k8s_relations.go",
	}
	for _, file := range files {
		t.Run(file, func(t *testing.T) {
			data, err := os.ReadFile(file)
			if err != nil {
				t.Fatalf("read %s: %v", file, err)
			}
			if strings.Contains(string(data), "context.TODO()") {
				t.Fatalf("%s contains context.TODO(); HTTP K8s handlers must use c.Request.Context() with a bounded timeout", file)
			}
		})
	}
}
