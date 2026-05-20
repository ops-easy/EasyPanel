package internal

import (
	"net/http"
	"strings"
	"sync/atomic"

	prometheusint "kube-bt-sync/api/k8s/provider"
)

var clusterAdvisoryRatingGauge int64 // 0 ok 1 warn 2 critical

func setClusterAdvisoryRatingGauge(rating string) {
	switch strings.ToLower(strings.TrimSpace(rating)) {
	case "critical":
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 2)
	case "warn", "warning":
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 1)
	default:
		atomic.StoreInt64(&clusterAdvisoryRatingGauge, 0)
	}
}

// handlePrometheusMetrics 暴露 Prometheus 文本指标（无需额外依赖）；供 Prometheus server scrape。
func handlePrometheusMetrics(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	body := prometheusint.RenderTextMetrics(prometheusint.MetricsSnapshot{
		BuildVersion:         BuildVersion,
		APIResponseCacheHits: apiResponseCacheHits(),
		APIResponseCacheMiss: apiResponseCacheMisses(),
		ControlPlaneAdvisory: atomic.LoadInt64(&clusterAdvisoryRatingGauge),
	})
	_, _ = w.Write([]byte(body))
}
