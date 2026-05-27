package core

import (
	"strings"
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

func TestKubePromValuesEnableDefaultPersistenceAndResources(t *testing.T) {
	values := buildKubePromStackValuesYAML(KubePromStackInstallOpts{})
	for _, want := range []string{
		`storage: "50Gi"`,
		"retentionSize: 45GB",
		"walCompression: true",
		"resources:\n      requests:\n        cpu: 500m\n        memory: 2Gi\n      limits:\n        cpu: \"2\"\n        memory: 6Gi",
		"prometheusOperator:\n  resources:\n    requests:\n      cpu: 100m\n      memory: 256Mi\n    limits:\n      cpu: 500m\n      memory: 512Mi",
		"kube-state-metrics:\n  resources:\n    requests:\n      cpu: 100m\n      memory: 256Mi\n    limits:\n      cpu: 500m\n      memory: 512Mi",
		"prometheus-node-exporter:\n  resources:\n    requests:\n      cpu: 50m\n      memory: 64Mi\n    limits:\n      cpu: 200m\n      memory: 256Mi",
	} {
		if !strings.Contains(values, want) {
			t.Fatalf("values YAML missing %q:\n%s", want, values)
		}
	}
}

func TestKubePromValuesAllowPrometheusResourceOverrides(t *testing.T) {
	values := buildKubePromStackValuesYAML(KubePromStackInstallOpts{
		StorageSize:             "100Gi",
		PrometheusCPURequest:    "750m",
		PrometheusMemoryRequest: "3Gi",
		PrometheusCPULimit:      "3",
		PrometheusMemoryLimit:   "8Gi",
	})
	for _, want := range []string{
		`storage: "100Gi"`,
		"retentionSize: 90GB",
		"cpu: 750m",
		"memory: 3Gi",
		"cpu: \"3\"",
		"memory: 8Gi",
	} {
		if !strings.Contains(values, want) {
			t.Fatalf("values YAML missing %q:\n%s", want, values)
		}
	}
}

func TestKubePrometheusStatefulSetNeedsPersistenceRecreate(t *testing.T) {
	volatile := &appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "prometheus-kbt-prom-kube-prometheus-s-prometheus"}}
	if !kubePrometheusStatefulSetNeedsPersistenceRecreate(volatile, "kbt-prom") {
		t.Fatal("Prometheus StatefulSet without volumeClaimTemplates should be recreated")
	}

	persistent := volatile.DeepCopy()
	persistent.Spec.VolumeClaimTemplates = []corev1.PersistentVolumeClaim{{ObjectMeta: metav1.ObjectMeta{Name: "prometheus-kbt-prom-db"}}}
	if kubePrometheusStatefulSetNeedsPersistenceRecreate(persistent, "kbt-prom") {
		t.Fatal("Prometheus StatefulSet with volumeClaimTemplates should not be recreated")
	}

	otherRelease := &appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "prometheus-other-kube-prometheus-s-prometheus"}}
	if kubePrometheusStatefulSetNeedsPersistenceRecreate(otherRelease, "kbt-prom") {
		t.Fatal("other releases must not be touched")
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
