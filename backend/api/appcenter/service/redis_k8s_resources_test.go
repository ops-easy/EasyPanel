package service

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestRedisWorkloadResourcesDefaultWhenUnset(t *testing.T) {
	res := redisWorkloadResourceRequirements(RedisK8sDeployOpts{})
	if res == nil {
		t.Fatal("redis resources should default when request omits explicit limits")
	}
	assertRedisQuantity(t, res.Requests, corev1.ResourceCPU, "250m")
	assertRedisQuantity(t, res.Requests, corev1.ResourceMemory, "768Mi")
	assertRedisQuantity(t, res.Limits, corev1.ResourceCPU, "1000m")
	assertRedisQuantity(t, res.Limits, corev1.ResourceMemory, "1Gi")
}

func TestRedisWorkloadResourcesAllowOverrides(t *testing.T) {
	res := redisWorkloadResourceRequirements(RedisK8sDeployOpts{
		RedisCPURequest:    "500m",
		RedisCPULimit:      "2",
		RedisMemoryRequest: "1Gi",
		RedisMemoryLimit:   "2Gi",
	})
	if res == nil {
		t.Fatal("redis resources should not be nil")
	}
	assertRedisQuantity(t, res.Requests, corev1.ResourceCPU, "500m")
	assertRedisQuantity(t, res.Requests, corev1.ResourceMemory, "1Gi")
	assertRedisQuantity(t, res.Limits, corev1.ResourceCPU, "2")
	assertRedisQuantity(t, res.Limits, corev1.ResourceMemory, "2Gi")
}

func assertRedisQuantity(t *testing.T, got corev1.ResourceList, name corev1.ResourceName, want string) {
	t.Helper()
	q, ok := got[name]
	if !ok {
		t.Fatalf("missing resource %s in %#v", name, got)
	}
	w := resource.MustParse(want)
	if q.Cmp(w) != 0 {
		t.Fatalf("resource %s=%s, want %s", name, q.String(), w.String())
	}
}
