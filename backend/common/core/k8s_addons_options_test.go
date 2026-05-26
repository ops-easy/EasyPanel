package core

import "testing"

func TestK8sAddonNamespaceValidation(t *testing.T) {
	valid := []string{"ingress-nginx", "kube-system", "easypanel-monitoring", "vl-logs-1"}
	for _, ns := range valid {
		if err := validateK8sAddonNamespace(ns); err != nil {
			t.Fatalf("expected namespace %q to be valid: %v", ns, err)
		}
	}

	invalid := []string{"", "Ingress_Nginx", "bad.ns", "-bad", "bad-", "a..b"}
	for _, ns := range invalid {
		if err := validateK8sAddonNamespace(ns); err == nil {
			t.Fatalf("expected namespace %q to be invalid", ns)
		}
	}
}

func TestK8sAddonReleaseNameValidation(t *testing.T) {
	valid := []string{"kbt-prom", "eplogs", "kubernetes-dashboard", "v1"}
	for _, name := range valid {
		if err := validateK8sAddonReleaseName(name); err != nil {
			t.Fatalf("expected release %q to be valid: %v", name, err)
		}
	}

	invalid := []string{"", "Bad_Release", "bad.release", "-bad", "bad-", "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzab"}
	for _, name := range invalid {
		if err := validateK8sAddonReleaseName(name); err == nil {
			t.Fatalf("expected release %q to be invalid", name)
		}
	}
}

func TestK8sAddonEffectiveDefaults(t *testing.T) {
	var rs *RuntimeSettings
	if got := effectiveIngressNginxNamespace(rs); got != "ingress-nginx" {
		t.Fatalf("ingress namespace default = %q", got)
	}
	if got := effectiveKubePrometheusStackNamespace(rs); got != "easypanel-monitoring" {
		t.Fatalf("kube-prometheus namespace default = %q", got)
	}
	if got := effectiveKubePrometheusStackReleaseName(rs); got != "kbt-prom" {
		t.Fatalf("kube-prometheus release default = %q", got)
	}
	if got := effectiveVictoriaLogsNamespace(rs); got != "easypanel-logging" {
		t.Fatalf("victoria logs namespace default = %q", got)
	}
	if got := effectiveVictoriaLogsReleaseName(rs); got != "eplogs" {
		t.Fatalf("victoria logs release default = %q", got)
	}
	if got := effectiveMetricsServerNamespace(rs); got != "kube-system" {
		t.Fatalf("metrics-server namespace default = %q", got)
	}
	if got := effectiveKubernetesDashboardNamespace(rs); got != "kubernetes-dashboard" {
		t.Fatalf("dashboard namespace default = %q", got)
	}
	if got := effectiveKubernetesDashboardReleaseName(rs); got != "kubernetes-dashboard" {
		t.Fatalf("dashboard release default = %q", got)
	}
}

func TestK8sAddonEffectiveRuntimeOverrides(t *testing.T) {
	rs := &RuntimeSettings{
		IngressNginxNamespace:          "custom-ingress",
		KubePrometheusStackNamespace:   "monitoring",
		KubePrometheusStackReleaseName: "kp",
		VictoriaLogsNamespace:          "logging",
		VictoriaLogsReleaseName:        "vl",
		MetricsServerNamespace:         "metrics",
		KubernetesDashboardNamespace:   "dash",
		KubernetesDashboardReleaseName: "dash-ui",
	}

	if got := effectiveIngressNginxNamespace(rs); got != "custom-ingress" {
		t.Fatalf("ingress namespace override = %q", got)
	}
	if got := effectiveKubePrometheusStackNamespace(rs); got != "monitoring" {
		t.Fatalf("kube-prometheus namespace override = %q", got)
	}
	if got := effectiveKubePrometheusStackReleaseName(rs); got != "kp" {
		t.Fatalf("kube-prometheus release override = %q", got)
	}
	if got := effectiveVictoriaLogsNamespace(rs); got != "logging" {
		t.Fatalf("victoria logs namespace override = %q", got)
	}
	if got := effectiveVictoriaLogsReleaseName(rs); got != "vl" {
		t.Fatalf("victoria logs release override = %q", got)
	}
	if got := effectiveMetricsServerNamespace(rs); got != "metrics" {
		t.Fatalf("metrics-server namespace override = %q", got)
	}
	if got := effectiveKubernetesDashboardNamespace(rs); got != "dash" {
		t.Fatalf("dashboard namespace override = %q", got)
	}
	if got := effectiveKubernetesDashboardReleaseName(rs); got != "dash-ui" {
		t.Fatalf("dashboard release override = %q", got)
	}
}
