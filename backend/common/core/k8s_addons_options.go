package core

import (
	"fmt"
	"strings"
)

const (
	defaultVictoriaLogsAddonNamespace   = "easypanel-logging"
	defaultVictoriaLogsAddonReleaseName = "eplogs"
)

func validateDNSLabelLike(value, field string, maxLen int) error {
	s := strings.TrimSpace(value)
	if s == "" {
		return fmt.Errorf("%s 不能为空", field)
	}
	if len(s) > maxLen {
		return fmt.Errorf("%s 长度不能超过 %d", field, maxLen)
	}
	for i, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-'
		if !ok {
			return fmt.Errorf("%s 只能包含小写字母、数字和短横线", field)
		}
		if (i == 0 || i == len(s)-1) && r == '-' {
			return fmt.Errorf("%s 不能以短横线开头或结尾", field)
		}
	}
	return nil
}

func validateK8sAddonNamespace(ns string) error {
	return validateDNSLabelLike(ns, "namespace", 63)
}

func validateK8sAddonReleaseName(name string) error {
	return validateDNSLabelLike(name, "releaseName", 53)
}

func firstValidAddonNamespace(value, fallback string) string {
	v := strings.TrimSpace(value)
	if validateK8sAddonNamespace(v) == nil {
		return v
	}
	return fallback
}

func firstValidAddonReleaseName(value, fallback string) string {
	v := strings.TrimSpace(value)
	if validateK8sAddonReleaseName(v) == nil {
		return v
	}
	return fallback
}

func effectiveIngressNginxNamespace(rs *RuntimeSettings) string {
	if rs == nil {
		return ingressNginxControllerNamespace
	}
	return firstValidAddonNamespace(rs.IngressNginxNamespace, ingressNginxControllerNamespace)
}

func effectiveKubePrometheusStackNamespace(rs *RuntimeSettings) string {
	if rs == nil {
		return kubePromStackNamespace
	}
	return firstValidAddonNamespace(rs.KubePrometheusStackNamespace, kubePromStackNamespace)
}

func effectiveKubePrometheusStackReleaseName(rs *RuntimeSettings) string {
	if rs == nil {
		return kubePromStackReleaseName
	}
	return firstValidAddonReleaseName(rs.KubePrometheusStackReleaseName, kubePromStackReleaseName)
}

func effectiveVictoriaLogsNamespace(rs *RuntimeSettings) string {
	if rs == nil {
		return defaultVictoriaLogsAddonNamespace
	}
	return firstValidAddonNamespace(rs.VictoriaLogsNamespace, defaultVictoriaLogsAddonNamespace)
}

func effectiveVictoriaLogsReleaseName(rs *RuntimeSettings) string {
	if rs == nil {
		return defaultVictoriaLogsAddonReleaseName
	}
	return firstValidAddonReleaseName(rs.VictoriaLogsReleaseName, defaultVictoriaLogsAddonReleaseName)
}

func effectiveMetricsServerNamespace(rs *RuntimeSettings) string {
	if rs == nil {
		return k8sMetricsServerNamespace
	}
	return firstValidAddonNamespace(rs.MetricsServerNamespace, k8sMetricsServerNamespace)
}

func effectiveKubernetesDashboardNamespace(rs *RuntimeSettings) string {
	if rs == nil {
		return k8sKubernetesDashboardNS
	}
	return firstValidAddonNamespace(rs.KubernetesDashboardNamespace, k8sKubernetesDashboardNS)
}

func effectiveKubernetesDashboardReleaseName(rs *RuntimeSettings) string {
	if rs == nil {
		return k8sKubernetesDashboardNS
	}
	return firstValidAddonReleaseName(rs.KubernetesDashboardReleaseName, k8sKubernetesDashboardNS)
}

func normalizeRuntimeK8sAddonDefaults(rs *RuntimeSettings) error {
	if rs == nil {
		return nil
	}
	fields := []struct {
		name  string
		value *string
		kind  string
	}{
		{name: "ingressNginxNamespace", value: &rs.IngressNginxNamespace, kind: "namespace"},
		{name: "kubePrometheusStackNamespace", value: &rs.KubePrometheusStackNamespace, kind: "namespace"},
		{name: "kubePrometheusStackReleaseName", value: &rs.KubePrometheusStackReleaseName, kind: "release"},
		{name: "victoriaLogsNamespace", value: &rs.VictoriaLogsNamespace, kind: "namespace"},
		{name: "victoriaLogsReleaseName", value: &rs.VictoriaLogsReleaseName, kind: "release"},
		{name: "metricsServerNamespace", value: &rs.MetricsServerNamespace, kind: "namespace"},
		{name: "kubernetesDashboardNamespace", value: &rs.KubernetesDashboardNamespace, kind: "namespace"},
		{name: "kubernetesDashboardReleaseName", value: &rs.KubernetesDashboardReleaseName, kind: "release"},
	}
	for _, f := range fields {
		v := strings.TrimSpace(*f.value)
		*f.value = v
		if v == "" {
			continue
		}
		var err error
		if f.kind == "release" {
			err = validateK8sAddonReleaseName(v)
		} else {
			err = validateK8sAddonNamespace(v)
		}
		if err != nil {
			return fmt.Errorf("%s 无效: %w", f.name, err)
		}
	}
	return nil
}

func fillRuntimeK8sAddonDefaults(rs *RuntimeSettings) {
	if rs == nil {
		return
	}
	rs.IngressNginxNamespace = effectiveIngressNginxNamespace(rs)
	rs.KubePrometheusStackNamespace = effectiveKubePrometheusStackNamespace(rs)
	rs.KubePrometheusStackReleaseName = effectiveKubePrometheusStackReleaseName(rs)
	rs.VictoriaLogsNamespace = effectiveVictoriaLogsNamespace(rs)
	rs.VictoriaLogsReleaseName = effectiveVictoriaLogsReleaseName(rs)
	rs.MetricsServerNamespace = effectiveMetricsServerNamespace(rs)
	rs.KubernetesDashboardNamespace = effectiveKubernetesDashboardNamespace(rs)
	rs.KubernetesDashboardReleaseName = effectiveKubernetesDashboardReleaseName(rs)
}
