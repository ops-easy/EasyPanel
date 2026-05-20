package provider

import (
	"fmt"
	"strings"
)

type MetricsSnapshot struct {
	BuildVersion         string
	APIResponseCacheHits uint64
	APIResponseCacheMiss uint64
	ControlPlaneAdvisory int64
}

func RenderTextMetrics(s MetricsSnapshot) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# HELP kubebt_build_info kube-bt-sync build\n")
	fmt.Fprintf(&b, "# TYPE kubebt_build_info gauge\n")
	fmt.Fprintf(&b, "kubebt_build_info{version=%q} 1\n", strings.TrimSpace(s.BuildVersion))
	fmt.Fprintf(&b, "# HELP kubebt_api_response_cache_hit_total GET JSON Redis 缓存命中次数\n")
	fmt.Fprintf(&b, "# TYPE kubebt_api_response_cache_hit_total counter\n")
	fmt.Fprintf(&b, "kubebt_api_response_cache_hit_total %d\n", s.APIResponseCacheHits)
	fmt.Fprintf(&b, "# HELP kubebt_api_response_cache_miss_total GET JSON Redis 缓存未命中次数\n")
	fmt.Fprintf(&b, "# TYPE kubebt_api_response_cache_miss_total counter\n")
	fmt.Fprintf(&b, "kubebt_api_response_cache_miss_total %d\n", s.APIResponseCacheMiss)
	fmt.Fprintf(&b, "# HELP kubebt_cluster_control_plane_advisory_rating 控制平面周期建议严重度 0=ok 1=warn 2=critical\n")
	fmt.Fprintf(&b, "# TYPE kubebt_cluster_control_plane_advisory_rating gauge\n")
	fmt.Fprintf(&b, "kubebt_cluster_control_plane_advisory_rating %d\n", s.ControlPlaneAdvisory)
	return b.String()
}
