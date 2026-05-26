package core

import (
	"strings"
	"testing"
)

func TestKubePromValuesExposeCommonInstallOptions(t *testing.T) {
	values := buildKubePromStackValuesYAML(KubePromStackInstallOpts{
		Retention:               "30d",
		ScrapeInterval:          "15s",
		StorageClassName:        "fast-ssd",
		StorageSize:             "100Gi",
		NodeExporterEnabled:     true,
		KubeStateMetricsEnabled: true,
	})
	for _, want := range []string{
		"retention: 30d",
		"scrapeInterval: 15s",
		"storageSpec:",
		`storage: "100Gi"`,
		`storageClassName: "fast-ssd"`,
		"nodeExporter:\n  enabled: true",
		"kubeStateMetrics:\n  enabled: true",
	} {
		if !strings.Contains(values, want) {
			t.Fatalf("values YAML missing %q:\n%s", want, values)
		}
	}
}
