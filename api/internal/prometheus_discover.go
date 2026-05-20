package internal

import (
	"context"
	"net/http"
	"time"

	prometheusint "kube-bt-sync/api/k8s/provider"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// PrometheusDiscoverCandidate 集群内可能为 Prometheus HTTP 端点的 Service。
type PrometheusDiscoverCandidate = prometheusint.DiscoverCandidate

func serviceLooksLikePrometheus(svc *corev1.Service) bool {
	return prometheusint.ServiceLooksLikePrometheus(svc)
}

func namespaceOKForPort9090(ns string) bool {
	return prometheusint.NamespaceOKForPort9090(ns)
}

func portLooksLikePrometheusHTTP(p corev1.ServicePort) bool {
	return prometheusint.PortLooksLikeHTTP(p)
}

func buildServiceBaseURL(svc *corev1.Service, port int32) string {
	return prometheusint.ServiceBaseURL(svc, port)
}

func discoverPrometheusFromServices(list *corev1.ServiceList) []PrometheusDiscoverCandidate {
	return prometheusint.DiscoverFromServices(list)
}

func handlePrometheusDiscover(c *gin.Context, k8s *kubernetes.Clientset) {
	if !GuardK8s(c, k8s) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 90*time.Second)
	defer cancel()

	list, err := k8s.CoreV1().Services("").List(ctx, metav1.ListOptions{Limit: 500})
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "列出 Service 失败: " + err.Error()})
		return
	}
	cands := discoverPrometheusFromServices(list)
	c.JSON(http.StatusOK, gin.H{"candidates": cands})
}
