package core

import (
	"context"
	"errors"
	"strings"
	"time"

	"kube-bt-sync/common/k8sutil"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
)

func dashboardUsernameFromGin(c *gin.Context) string {
	return DashboardUsernameFromGin(c)
}

func nullIfEmpty(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func int32Ptr(i int32) *int32 { return k8sutil.Int32Ptr(i) }

type AppRedisMode string

const (
	AppRedisStandalone  AppRedisMode = "standalone"
	AppRedisSentinel    AppRedisMode = "sentinel"
	AppRedisReplication AppRedisMode = "replication"
	AppRedisCluster     AppRedisMode = "cluster"
)

type appRedisStoredConfig struct {
	Mode          AppRedisMode `json:"mode"`
	DB            int          `json:"db"`
	PasswordEnc   string       `json:"passwordEnc,omitempty"`
	Addr          string       `json:"addr,omitempty"`
	SentinelAddrs []string     `json:"sentinelAddrs,omitempty"`
	MasterName    string       `json:"masterName,omitempty"`
	MasterAddr    string       `json:"masterAddr,omitempty"`
	ReplicaAddr   string       `json:"replicaAddr,omitempty"`
	ClusterAddrs  []string     `json:"clusterAddrs,omitempty"`

	K8sNamespace string `json:"k8sNamespace,omitempty"`
	K8sBaseName  string `json:"k8sBaseName,omitempty"`
	K8sTopology  string `json:"k8sTopology,omitempty"`
	K8sSvcPort   int32  `json:"k8sSvcPort,omitempty"`

	K8sServiceType string `json:"k8sServiceType,omitempty"`

	K8sEngineLine            string `json:"k8sEngineLine,omitempty"`
	K8sMaxmemory             string `json:"k8sMaxmemory,omitempty"`
	K8sMaxmemoryPolicy       string `json:"k8sMaxmemoryPolicy,omitempty"`
	K8sAppendonly            bool   `json:"k8sAppendonly,omitempty"`
	K8sRedisImageResolved    string `json:"k8sRedisImageResolved,omitempty"`
	K8sExporterEnabled       bool   `json:"k8sExporterEnabled,omitempty"`
	K8sExporterImageResolved string `json:"k8sExporterImageResolved,omitempty"`
	K8sRedisCPURequest       string `json:"k8sRedisCpuRequest,omitempty"`
	K8sRedisCPULimit         string `json:"k8sRedisCpuLimit,omitempty"`
	K8sRedisMemoryRequest    string `json:"k8sRedisMemoryRequest,omitempty"`
	K8sRedisMemoryLimit      string `json:"k8sRedisMemoryLimit,omitempty"`
	K8sPersistenceEnabled    bool   `json:"k8sPersistenceEnabled,omitempty"`
	K8sStorageSize           string `json:"k8sStorageSize,omitempty"`
	K8sStorageClass          string `json:"k8sStorageClass,omitempty"`
	K8sTemplateID            int64  `json:"k8sTemplateId,omitempty"`
	K8sTemplateName          string `json:"k8sTemplateName,omitempty"`
}

func decryptAppRedisPassword(cfg Config, enc string) (string, error) {
	key, err := sshEncryptionKey(cfg)
	if err != nil {
		return "", err
	}
	return decryptSecret(key, enc)
}

func openAppRedisClient(ctx context.Context, cfg Config, st *appRedisStoredConfig) (redis.Cmdable, func(), error) {
	pass, err := decryptAppRedisPassword(cfg, st.PasswordEnc)
	if err != nil {
		return nil, nil, err
	}
	_ = ctx

	sharedOpts := func(addr string, db int) *redis.Options {
		return &redis.Options{
			Addr:            addr,
			Password:        pass,
			DB:              db,
			DialTimeout:     10 * time.Second,
			ReadTimeout:     30 * time.Second,
			WriteTimeout:    30 * time.Second,
			PoolSize:        10,
			MaxRetries:      3,
			MinRetryBackoff: 100 * time.Millisecond,
			MaxRetryBackoff: 2 * time.Second,
			ConnMaxIdleTime: 5 * time.Minute,
			PoolFIFO:        true,
		}
	}
	switch st.Mode {
	case AppRedisStandalone:
		rdb := redis.NewClient(sharedOpts(st.Addr, st.DB))
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisReplication:
		rdb := redis.NewClient(sharedOpts(st.MasterAddr, st.DB))
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisSentinel:
		if len(st.SentinelAddrs) == 0 {
			return nil, nil, errors.New("哨兵地址为空")
		}
		rdb := redis.NewFailoverClient(&redis.FailoverOptions{
			MasterName:      st.MasterName,
			SentinelAddrs:   st.SentinelAddrs,
			Password:        pass,
			DB:              st.DB,
			DialTimeout:     10 * time.Second,
			ReadTimeout:     30 * time.Second,
			WriteTimeout:    30 * time.Second,
			PoolSize:        10,
			MaxRetries:      3,
			MinRetryBackoff: 100 * time.Millisecond,
			MaxRetryBackoff: 2 * time.Second,
			ConnMaxIdleTime: 5 * time.Minute,
		})
		return rdb, func() { _ = rdb.Close() }, nil
	case AppRedisCluster:
		if len(st.ClusterAddrs) == 0 {
			return nil, nil, errors.New("cluster 地址为空")
		}
		rdb := redis.NewClusterClient(&redis.ClusterOptions{
			Addrs:           st.ClusterAddrs,
			Password:        pass,
			DialTimeout:     10 * time.Second,
			ReadTimeout:     30 * time.Second,
			WriteTimeout:    30 * time.Second,
			PoolSize:        10,
			MaxRetries:      3,
			MinRetryBackoff: 100 * time.Millisecond,
			MaxRetryBackoff: 2 * time.Second,
			ConnMaxIdleTime: 5 * time.Minute,
		})
		return rdb, func() { _ = rdb.Close() }, nil
	default:
		return nil, nil, errors.New("未知模式")
	}
}

func parseRedisInfoLines(s string) map[string]string {
	m := make(map[string]string)
	for _, line := range strings.Split(s, "\r\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		i := strings.IndexByte(line, ':')
		if i <= 0 {
			continue
		}
		m[line[:i]] = strings.TrimSpace(line[i+1:])
	}
	return m
}

func AppRedisRuntimeSnapshot(ctx context.Context, rdb redis.Cmdable) (map[string]interface{}, error) {
	t0 := time.Now()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, err
	}
	latencyMs := time.Since(t0).Milliseconds()

	sectionNames := []string{"server", "memory", "stats", "replication", "clients", "cpu", "keyspace"}
	sections := make(map[string]map[string]string)
	for _, name := range sectionNames {
		raw, err := rdb.Info(ctx, name).Result()
		if err != nil {
			sections[name] = map[string]string{"_error": err.Error()}
			continue
		}
		sections[name] = parseRedisInfoLines(raw)
	}

	dbsize, err := rdb.DBSize(ctx).Result()
	if err != nil {
		return nil, err
	}

	cfg := make(map[string]string)
	for _, k := range []string{"maxmemory", "maxmemory-policy", "appendonly", "save", "tcp-keepalive", "timeout", "databases", "hz"} {
		m, err := rdb.ConfigGet(ctx, k).Result()
		if err != nil {
			continue
		}
		for ck, cv := range m {
			cfg[ck] = cv
		}
	}

	return map[string]interface{}{
		"capturedAt": time.Now().UTC().Format(time.RFC3339),
		"latencyMs":  latencyMs,
		"dbsize":     dbsize,
		"sections":   sections,
		"config":     cfg,
	}, nil
}

func ValidateK8sNamespaceName(ns string) error {
	return k8sutil.ValidateNamespaceName(ns)
}

func ValidateK8sDeploymentName(name string) error {
	return k8sutil.ValidateDeploymentName(name)
}

func ValidateOptionalK8sNodePort(field string, p int32) error {
	return k8sutil.ValidateOptionalNodePort(field, p)
}

func ensureNamespace(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	return k8sutil.EnsureNamespace(ctx, k8s, name)
}

func firstNonEmpty(a, b string) string {
	return k8sutil.FirstNonEmpty(a, b)
}

func ResolveRedisK8sStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
	return k8sutil.ResolveStorageClass(ctx, k8s, userOrCfg)
}

func buildRedisPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	return k8sutil.BuildRWOPVC(ns, name, storageClassName, size, labels)
}

func applyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
	return k8sutil.ApplyPVC(ctx, k8s, pvc)
}

func upsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
	return k8sutil.UpsertService(ctx, k8s, svc)
}

func upsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
	return k8sutil.UpsertDeployment(ctx, k8s, dep)
}

func upsertStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
	return k8sutil.UpsertStatefulSet(ctx, k8s, sts)
}
