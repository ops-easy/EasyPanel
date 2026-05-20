package provider

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestDiscoverFromServicesByNameAndPort(t *testing.T) {
	list := &corev1.ServiceList{Items: []corev1.Service{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "grafana", Namespace: "monitoring"},
			Spec:       corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "http", Port: 3000}}},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "prometheus-k8s", Namespace: "monitoring"},
			Spec:       corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "web", Port: 9090}}},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "metrics", Namespace: "observability"},
			Spec:       corev1.ServiceSpec{Ports: []corev1.ServicePort{{Name: "http", Port: 9091}}},
		},
	}}

	got := DiscoverFromServices(list)
	if len(got) != 2 {
		t.Fatalf("len = %d, want 2: %#v", len(got), got)
	}
	if got[0].ID != "monitoring/prometheus-k8s:9090" || got[0].BaseURL != "http://prometheus-k8s.monitoring.svc:9090" {
		t.Fatalf("unexpected first candidate: %#v", got[0])
	}
	if got[1].ID != "observability/metrics:9091" || got[1].Reason != "port 9091" {
		t.Fatalf("unexpected second candidate: %#v", got[1])
	}
}

func TestDiscoverFromServicesSkipsExternalName(t *testing.T) {
	list := &corev1.ServiceList{Items: []corev1.Service{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "prometheus-external", Namespace: "monitoring"},
			Spec: corev1.ServiceSpec{
				Type:  corev1.ServiceTypeExternalName,
				Ports: []corev1.ServicePort{{Name: "web", Port: 9090}},
			},
		},
	}}
	if got := DiscoverFromServices(list); len(got) != 0 {
		t.Fatalf("expected no candidates, got %#v", got)
	}
}
