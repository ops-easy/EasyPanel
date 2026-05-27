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

func TestKubePromValuesDisableGrafanaHelmTestPod(t *testing.T) {
	values := buildKubePromStackValuesYAML(KubePromStackInstallOpts{
		GrafanaEnabled: true,
	})
	for _, want := range []string{
		"grafana:\n  enabled: true",
		"  testFramework:\n    enabled: false",
	} {
		if !strings.Contains(values, want) {
			t.Fatalf("values YAML missing %q:\n%s", want, values)
		}
	}
}

func TestKubePromDisabledOptionalComponentsFollowInstallOptions(t *testing.T) {
	got := kubePromDisabledOptionalComponents(KubePromStackInstallOpts{
		GrafanaEnabled:          true,
		AlertmanagerEnabled:     false,
		NodeExporterEnabled:     true,
		KubeStateMetricsEnabled: false,
	})
	want := []string{kubePromOptionalAlertmanager, kubePromOptionalKubeStateMetrics}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("disabled components = %#v, want %#v", got, want)
	}
}

func TestKubePromOptionalComponentResourceMatchesRelease(t *testing.T) {
	tests := []struct {
		name      string
		labels    map[string]string
		component string
		want      bool
	}{
		{
			name:      "kbt-prom-grafana",
			labels:    map[string]string{"app.kubernetes.io/instance": "kbt-prom", "app.kubernetes.io/name": "grafana"},
			component: kubePromOptionalGrafana,
			want:      true,
		},
		{
			name:      "alertmanager-kbt-prom-kube-prometheus-s-alertmanager",
			labels:    map[string]string{"alertmanager": "kbt-prom-kube-prometheus-s-alertmanager"},
			component: kubePromOptionalAlertmanager,
			want:      true,
		},
		{
			name:      "kbt-prom-prometheus-node-exporter",
			labels:    map[string]string{"app.kubernetes.io/instance": "kbt-prom", "app.kubernetes.io/name": "prometheus-node-exporter"},
			component: kubePromOptionalNodeExporter,
			want:      true,
		},
		{
			name:      "other-prom-grafana",
			labels:    map[string]string{"app.kubernetes.io/instance": "other-prom", "app.kubernetes.io/name": "grafana"},
			component: kubePromOptionalGrafana,
			want:      false,
		},
		{
			name:      "kbt-prom-kube-prometheus-s-prometheus",
			labels:    map[string]string{"app.kubernetes.io/instance": "kbt-prom", "app.kubernetes.io/name": "kube-prometheus-stack-prometheus"},
			component: kubePromOptionalAlertmanager,
			want:      false,
		},
	}

	for _, tt := range tests {
		if got := kubePromOptionalComponentResourceMatches(tt.name, tt.labels, "kbt-prom", tt.component); got != tt.want {
			t.Fatalf("match %q component %q = %v, want %v", tt.name, tt.component, got, tt.want)
		}
	}
}
