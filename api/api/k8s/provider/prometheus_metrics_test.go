package provider

import (
	"strings"
	"testing"
)

func TestRenderTextMetrics(t *testing.T) {
	got := RenderTextMetrics(MetricsSnapshot{
		BuildVersion:         " v1.2.3 ",
		APIResponseCacheHits: 7,
		APIResponseCacheMiss: 3,
		ControlPlaneAdvisory: 2,
	})
	for _, want := range []string{
		`kubebt_build_info{version="v1.2.3"} 1`,
		`kubebt_api_response_cache_hit_total 7`,
		`kubebt_api_response_cache_miss_total 3`,
		`kubebt_cluster_control_plane_advisory_rating 2`,
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("missing %q in:\n%s", want, got)
		}
	}
}
