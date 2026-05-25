package service

import (
	"context"
	"fmt"
	"strings"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

func AppMySQLK8sRolloutStatus(ctx context.Context, k8s *kubernetes.Clientset, st *appMySQLStoredConfig) (map[string]interface{}, error) {
	if k8s == nil || !appMySQLStoredIsPlatformK8s(st) {
		return nil, fmt.Errorf("missing K8s metadata")
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, base, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			return rolloutJSON("unknown", "Deployment not found", nil), nil
		}
		return nil, err
	}
	desired := int32(1)
	if dep.Spec.Replicas != nil {
		desired = *dep.Spec.Replicas
	}
	phase, msg := phaseFromCounts(dep.Status.ReadyReplicas, desired, "Deployment")
	return rolloutJSON(phase, msg, []map[string]interface{}{
		{"kind": "Deployment", "name": base, "ready": dep.Status.ReadyReplicas, "desired": desired},
	}), nil
}

func CollectAppMySQLK8sNetwork(ctx context.Context, k8s *kubernetes.Clientset, opts AppMySQLK8sDeployOpts) []map[string]interface{} {
	if k8s == nil {
		return nil
	}
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	if ns == "" || base == "" {
		return nil
	}
	svc, err := k8s.CoreV1().Services(ns).Get(ctx, base, metav1.GetOptions{})
	if err != nil {
		return nil
	}
	item := map[string]interface{}{
		"name":      svc.Name,
		"namespace": svc.Namespace,
		"type":      string(svc.Spec.Type),
		"clusterIP": svc.Spec.ClusterIP,
	}
	var ports []map[string]interface{}
	for _, p := range svc.Spec.Ports {
		ports = append(ports, map[string]interface{}{
			"name":     p.Name,
			"port":     p.Port,
			"nodePort": p.NodePort,
			"protocol": string(p.Protocol),
		})
	}
	item["ports"] = ports
	return []map[string]interface{}{item}
}

func AppMySQLK8sDeployOptsFromStored(st *appMySQLStoredConfig) (AppMySQLK8sDeployOpts, bool) {
	if !appMySQLStoredIsPlatformK8s(st) {
		return AppMySQLK8sDeployOpts{}, false
	}
	return AppMySQLK8sDeployOpts{
		Namespace:          st.K8sNamespace,
		BaseName:           st.K8sBaseName,
		Version:            st.K8sVersionLine,
		SvcPort:            st.K8sSvcPort,
		ServiceType:        st.K8sServiceType,
		EnableExporter:     st.K8sExporterEnabled,
		MySQLImage:         st.K8sMySQLImageResolved,
		ExporterImage:      st.K8sExporterImageResolved,
		PersistenceEnabled: st.K8sPersistenceEnabled,
		StorageSize:        st.K8sStorageSize,
		StorageClassName:   st.K8sStorageClass,
		TemplateID:         st.K8sTemplateID,
		TemplateName:       st.K8sTemplateName,
	}, true
}

func DeleteAppMySQLK8sStack(ctx context.Context, k8s *kubernetes.Clientset, ns, base string, deletePVC bool) []string {
	var warnings []string
	ns = strings.TrimSpace(ns)
	base = strings.TrimSpace(base)
	if k8s == nil || ns == "" || base == "" {
		return nil
	}
	prop := metav1.DeletePropagationForeground
	fg := metav1.DeleteOptions{PropagationPolicy: &prop}
	del := func(desc string, fn func() error) {
		if err := fn(); err != nil && !apierrors.IsNotFound(err) {
			warnings = append(warnings, fmt.Sprintf("%s: %v", desc, err))
		}
	}
	del("Deployment "+base, func() error {
		return k8s.AppsV1().Deployments(ns).Delete(ctx, base, fg)
	})
	del("Service "+base, func() error {
		return k8s.CoreV1().Services(ns).Delete(ctx, base, metav1.DeleteOptions{})
	})
	if deletePVC {
		del("PVC "+appMySQLDataPVCName(base), func() error {
			return k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, appMySQLDataPVCName(base), metav1.DeleteOptions{})
		})
	}
	del("Secret "+appMySQLAuthSecretName(base), func() error {
		return k8s.CoreV1().Secrets(ns).Delete(ctx, appMySQLAuthSecretName(base), metav1.DeleteOptions{})
	})
	return warnings
}
