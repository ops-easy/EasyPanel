package core

import (
	"context"
	"errors"
	"fmt"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"
)

const (
	kubePromOptionalGrafana          = "grafana"
	kubePromOptionalAlertmanager     = "alertmanager"
	kubePromOptionalNodeExporter     = "node-exporter"
	kubePromOptionalKubeStateMetrics = "kube-state-metrics"
)

type kubePromOptionalCleanupResource struct {
	gvr        schema.GroupVersionResource
	namespaced bool
}

var kubePromOptionalCleanupResources = []kubePromOptionalCleanupResource{
	{gvr: schema.GroupVersionResource{Version: "v1", Resource: "pods"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Version: "v1", Resource: "services"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Version: "v1", Resource: "configmaps"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Version: "v1", Resource: "secrets"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Version: "v1", Resource: "serviceaccounts"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "deployments"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "statefulsets"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "apps", Version: "v1", Resource: "daemonsets"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "roles"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "rolebindings"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "ingresses"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "networking.k8s.io", Version: "v1", Resource: "networkpolicies"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "policy", Version: "v1", Resource: "poddisruptionbudgets"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "alertmanagers"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "servicemonitors"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "podmonitors"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "monitoring.coreos.com", Version: "v1", Resource: "prometheusrules"}, namespaced: true},
	{gvr: schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterroles"}},
	{gvr: schema.GroupVersionResource{Group: "rbac.authorization.k8s.io", Version: "v1", Resource: "clusterrolebindings"}},
}

func cleanupKubePrometheusDisabledOptionalComponents(ctx context.Context, restCfg *rest.Config, ns, releaseName string, opts KubePromStackInstallOpts) error {
	components := kubePromDisabledOptionalComponents(opts)
	if restCfg == nil || strings.TrimSpace(ns) == "" || len(components) == 0 {
		return nil
	}
	dyn, err := dynamic.NewForConfig(restCfg)
	if err != nil {
		return err
	}
	var errs []error
	bg := metav1.DeletePropagationBackground
	deleteOpts := metav1.DeleteOptions{PropagationPolicy: &bg}
	for _, res := range kubePromOptionalCleanupResources {
		var resourceClient dynamic.ResourceInterface
		if res.namespaced {
			resourceClient = dyn.Resource(res.gvr).Namespace(ns)
		} else {
			resourceClient = dyn.Resource(res.gvr)
		}
		list, err := resourceClient.List(ctx, metav1.ListOptions{})
		if err != nil {
			kubePromRecordCleanupErr(&errs, "list "+res.gvr.Resource, err)
			continue
		}
		for i := range list.Items {
			item := &list.Items[i]
			component := kubePromOptionalComponentForResource(item.GetName(), item.GetLabels(), releaseName, components)
			if component == "" {
				continue
			}
			err := resourceClient.Delete(ctx, item.GetName(), deleteOpts)
			kubePromRecordCleanupErr(&errs, "delete "+res.gvr.Resource+" "+item.GetName()+" ("+component+")", err)
		}
	}
	return errors.Join(errs...)
}

func kubePromDisabledOptionalComponents(opts KubePromStackInstallOpts) []string {
	var out []string
	if !opts.GrafanaEnabled {
		out = append(out, kubePromOptionalGrafana)
	}
	if !opts.AlertmanagerEnabled {
		out = append(out, kubePromOptionalAlertmanager)
	}
	if !opts.NodeExporterEnabled {
		out = append(out, kubePromOptionalNodeExporter)
	}
	if !opts.KubeStateMetricsEnabled {
		out = append(out, kubePromOptionalKubeStateMetrics)
	}
	return out
}

func kubePromOptionalComponentForResource(name string, labels map[string]string, releaseName string, components []string) string {
	for _, component := range components {
		if kubePromOptionalComponentResourceMatches(name, labels, releaseName, component) {
			return component
		}
	}
	return ""
}

func kubePromOptionalComponentResourceMatches(name string, labels map[string]string, releaseName, component string) bool {
	n := strings.ToLower(strings.TrimSpace(name))
	release := strings.ToLower(firstValidAddonReleaseName(releaseName, kubePromStackReleaseName))
	component = strings.ToLower(strings.TrimSpace(component))
	if n == "" || release == "" || component == "" {
		return false
	}
	labelValue := func(key string) string {
		if labels == nil {
			return ""
		}
		return strings.ToLower(strings.TrimSpace(labels[key]))
	}
	releaseLabel := false
	for _, key := range []string{"app.kubernetes.io/instance", "release"} {
		if labelValue(key) == release {
			releaseLabel = true
			break
		}
	}
	if component == kubePromOptionalAlertmanager && strings.Contains(labelValue("alertmanager"), release) {
		return true
	}
	if strings.Contains(n, release) && kubePromOptionalComponentNameMatches(n, component) {
		return true
	}
	if !releaseLabel {
		return false
	}
	for _, key := range []string{
		"app.kubernetes.io/name",
		"app.kubernetes.io/component",
		"app",
		"component",
		"k8s-app",
		"helm.sh/chart",
	} {
		if kubePromOptionalComponentNameMatches(labelValue(key), component) {
			return true
		}
	}
	return false
}

func kubePromOptionalComponentNameMatches(value, component string) bool {
	v := strings.ToLower(strings.TrimSpace(value))
	c := strings.ToLower(strings.TrimSpace(component))
	if v == "" || c == "" {
		return false
	}
	switch c {
	case kubePromOptionalGrafana:
		return strings.Contains(v, "grafana")
	case kubePromOptionalAlertmanager:
		return strings.Contains(v, "alertmanager")
	case kubePromOptionalNodeExporter:
		return strings.Contains(v, "node-exporter") || strings.Contains(v, "nodeexporter")
	case kubePromOptionalKubeStateMetrics:
		return strings.Contains(v, "kube-state-metrics") || strings.Contains(v, "kube-state")
	default:
		return strings.Contains(v, c)
	}
}

func kubePromRecordCleanupErr(errs *[]error, action string, err error) {
	if err == nil || kubePromOptionalCleanupMissingResourceErr(err) {
		return
	}
	*errs = append(*errs, fmt.Errorf("%s: %w", action, err))
}

func kubePromOptionalCleanupMissingResourceErr(err error) bool {
	if err == nil || apierrors.IsNotFound(err) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "could not find the requested resource") ||
		strings.Contains(msg, "the server could not find the requested resource") ||
		strings.Contains(msg, "no matches for kind")
}
