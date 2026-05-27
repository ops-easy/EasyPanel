package service

import (
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

const (
	defaultRedisCPURequest    = "250m"
	defaultRedisCPULimit      = "1000m"
	defaultRedisMemoryRequest = "768Mi"
	defaultRedisMemoryLimit   = "1Gi"
)

func parseQty(s string) (resource.Quantity, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return resource.Quantity{}, fmt.Errorf("empty")
	}
	return resource.ParseQuantity(s)
}

// redisWorkloadResourceRequirements 将向导中的 CPU/内存 request、limit 转为 Pod 容器 resources（与 Redis maxmemory 独立：K8s 限制为进程总内存上限）。
func redisWorkloadResourceRequirements(opts RedisK8sDeployOpts) *corev1.ResourceRequirements {
	r := &corev1.ResourceRequirements{}
	add := func(dst *corev1.ResourceList, name corev1.ResourceName, s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		q, err := parseQty(s)
		if err != nil {
			return
		}
		if *dst == nil {
			*dst = corev1.ResourceList{}
		}
		(*dst)[name] = q
	}
	add(&r.Requests, corev1.ResourceCPU, firstNonEmpty(opts.RedisCPURequest, defaultRedisCPURequest))
	add(&r.Limits, corev1.ResourceCPU, firstNonEmpty(opts.RedisCPULimit, defaultRedisCPULimit))
	add(&r.Requests, corev1.ResourceMemory, firstNonEmpty(opts.RedisMemoryRequest, defaultRedisMemoryRequest))
	add(&r.Limits, corev1.ResourceMemory, firstNonEmpty(opts.RedisMemoryLimit, defaultRedisMemoryLimit))
	if (r.Requests == nil || len(r.Requests) == 0) && (r.Limits == nil || len(r.Limits) == 0) {
		return nil
	}
	return r
}

func applyRedisWorkloadResources(c *corev1.Container, opts RedisK8sDeployOpts) {
	if r := redisWorkloadResourceRequirements(opts); r != nil {
		c.Resources = *r
	}
}

// exporterSidecarResources redis_exporter 边车默认轻量占用，避免与主容器争用未设限时的突发。
func exporterSidecarResources() corev1.ResourceRequirements {
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("50m"),
			corev1.ResourceMemory: resource.MustParse("64Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("200m"),
			corev1.ResourceMemory: resource.MustParse("128Mi"),
		},
	}
}
