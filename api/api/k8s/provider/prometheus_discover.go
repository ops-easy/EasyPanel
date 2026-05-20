package provider

import (
	"fmt"
	"sort"
	"strings"

	corev1 "k8s.io/api/core/v1"
)

// DiscoverCandidate is an in-cluster Service that may expose Prometheus HTTP APIs.
type DiscoverCandidate struct {
	ID        string `json:"id"`
	Namespace string `json:"namespace"`
	Name      string `json:"name"`
	Port      int32  `json:"port"`
	PortName  string `json:"portName,omitempty"`
	BaseURL   string `json:"baseUrl"`
	Reason    string `json:"reason"`
}

func ServiceLooksLikePrometheus(svc *corev1.Service) bool {
	ln := strings.ToLower(svc.Name)
	if strings.Contains(ln, "alertmanager") || strings.Contains(ln, "grafana") || strings.Contains(ln, "oauth") {
		return false
	}
	return strings.Contains(ln, "prometheus") || strings.Contains(ln, "thanos-query") || strings.Contains(ln, "thanos-querier")
}

func NamespaceOKForPort9090(ns string) bool {
	n := strings.ToLower(ns)
	if n == "kube-system" || n == "kube-public" || n == "kube-node-lease" {
		return false
	}
	return strings.Contains(n, "monitoring") || strings.Contains(n, "observability") ||
		strings.Contains(n, "openshift") || strings.Contains(n, "prometheus") ||
		strings.Contains(n, "lens-metrics")
}

func PortLooksLikeHTTP(p corev1.ServicePort) bool {
	if p.Protocol != "" && p.Protocol != corev1.ProtocolTCP {
		return false
	}
	if p.Port == 9090 || p.Port == 9091 {
		return true
	}
	pn := strings.ToLower(p.Name)
	return strings.Contains(pn, "web") || strings.Contains(pn, "http") || strings.Contains(pn, "prom")
}

func ServiceBaseURL(svc *corev1.Service, port int32) string {
	return fmt.Sprintf("http://%s.%s.svc:%d", svc.Name, svc.Namespace, port)
}

func appendCandidate(out *[]DiscoverCandidate, seen map[string]struct{}, svc *corev1.Service, sp corev1.ServicePort, reason string) {
	if sp.Port <= 0 {
		return
	}
	base := ServiceBaseURL(svc, sp.Port)
	if _, ok := seen[base]; ok {
		return
	}
	seen[base] = struct{}{}
	id := fmt.Sprintf("%s/%s:%d", svc.Namespace, svc.Name, sp.Port)
	pn := sp.Name
	*out = append(*out, DiscoverCandidate{
		ID:        id,
		Namespace: svc.Namespace,
		Name:      svc.Name,
		Port:      sp.Port,
		PortName:  pn,
		BaseURL:   base,
		Reason:    reason,
	})
}

func DiscoverFromServices(list *corev1.ServiceList) []DiscoverCandidate {
	var out []DiscoverCandidate
	seen := make(map[string]struct{})

	for i := range list.Items {
		svc := &list.Items[i]
		if svc.Spec.Type == corev1.ServiceTypeExternalName {
			continue
		}
		nameHit := ServiceLooksLikePrometheus(svc)
		ports := svc.Spec.Ports
		for _, sp := range ports {
			if sp.Protocol != "" && sp.Protocol != corev1.ProtocolTCP {
				continue
			}
			if sp.Port <= 0 {
				continue
			}
			if nameHit {
				if PortLooksLikeHTTP(sp) || sp.Port == 8080 {
					appendCandidate(&out, seen, svc, sp, "service name")
					continue
				}
				if len(ports) == 1 {
					appendCandidate(&out, seen, svc, sp, "service name (single port)")
				}
				continue
			}
			if PortLooksLikeHTTP(sp) && (sp.Port == 9090 || sp.Port == 9091) && NamespaceOKForPort9090(svc.Namespace) {
				appendCandidate(&out, seen, svc, sp, fmt.Sprintf("port %d", sp.Port))
			}
		}
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].Namespace != out[j].Namespace {
			return out[i].Namespace < out[j].Namespace
		}
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].Port < out[j].Port
	})
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}
