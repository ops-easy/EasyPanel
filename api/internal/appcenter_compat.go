package internal

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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

func int32Ptr(i int32) *int32 { return &i }

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

var k8sDNSLabelRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

func ValidateK8sNamespaceName(ns string) error {
	ns = strings.TrimSpace(ns)
	if ns == "" {
		return errors.New("命名空间不能为空")
	}
	if len(ns) > 63 {
		return errors.New("命名空间名称长度不能超过 63")
	}
	if !k8sDNSLabelRe.MatchString(ns) {
		return errors.New("命名空间格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

func ValidateK8sDeploymentName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("Deployment 名称不能为空")
	}
	if len(name) > 63 {
		return errors.New("Deployment 名称长度不能超过 63")
	}
	if !k8sDNSLabelRe.MatchString(name) {
		return errors.New("Deployment 名称格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

func ValidateOptionalK8sNodePort(field string, p int32) error {
	if p == 0 {
		return nil
	}
	if p < 30000 || p > 32767 {
		return fmt.Errorf("%s 须为 0（自动）或 30000–32767", field)
	}
	return nil
}

func ensureNamespace(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	_, err := k8s.CoreV1().Namespaces().Get(ctx, name, metav1.GetOptions{})
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	_, err = k8s.CoreV1().Namespaces().Create(ctx, &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{Name: name},
	}, metav1.CreateOptions{})
	return err
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return strings.TrimSpace(b)
}

func ResolveRedisK8sStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
	if strings.TrimSpace(userOrCfg) != "" {
		return strings.TrimSpace(userOrCfg), nil
	}
	return pickDefaultStorageClassName(ctx, k8s)
}

func pickDefaultStorageClassName(ctx context.Context, k8s *kubernetes.Clientset) (string, error) {
	list, err := k8s.StorageV1().StorageClasses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return "", err
	}
	for i := range list.Items {
		sc := &list.Items[i]
		if sc.Annotations["storageclass.kubernetes.io/is-default-class"] == "true" {
			return sc.Name, nil
		}
	}
	if len(list.Items) == 0 {
		return "", fmt.Errorf("集群中无 StorageClass，请在部署时指定或创建默认 StorageClass")
	}
	return list.Items[0].Name, nil
}

func parseStorageSize(s string) (resource.Quantity, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		s = "10Gi"
	}
	return resource.ParseQuantity(s)
}

func buildRedisPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	qty, err := parseStorageSize(size)
	if err != nil {
		return nil, err
	}
	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: labels},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: qty},
			},
		},
	}
	if strings.TrimSpace(storageClassName) != "" {
		sc := strings.TrimSpace(storageClassName)
		pvc.Spec.StorageClassName = &sc
	}
	return pvc, nil
}

func applyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
	cli := k8s.CoreV1().PersistentVolumeClaims(pvc.Namespace)
	_, err := cli.Get(ctx, pvc.Name, metav1.GetOptions{})
	if err == nil {
		return nil
	}
	if !apierrors.IsNotFound(err) {
		return err
	}
	_, err = cli.Create(ctx, pvc, metav1.CreateOptions{})
	return err
}

func upsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
	ns := svc.Namespace
	scli := k8s.CoreV1().Services(ns)
	exS, err := scli.Get(ctx, svc.Name, metav1.GetOptions{})
	if err == nil {
		svc.ResourceVersion = exS.ResourceVersion
		svc.Spec.ClusterIP = exS.Spec.ClusterIP
		svc.Spec.ClusterIPs = exS.Spec.ClusterIPs
		_, err = scli.Update(ctx, svc, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = scli.Create(ctx, svc, metav1.CreateOptions{})
		return err
	}
	return err
}

func upsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
	ns := dep.Namespace
	dcli := k8s.AppsV1().Deployments(ns)
	exD, err := dcli.Get(ctx, dep.Name, metav1.GetOptions{})
	if err == nil {
		dep.ResourceVersion = exD.ResourceVersion
		_, err = dcli.Update(ctx, dep, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = dcli.Create(ctx, dep, metav1.CreateOptions{})
		return err
	}
	return err
}

func upsertStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
	ns := sts.Namespace
	cli := k8s.AppsV1().StatefulSets(ns)
	ex, err := cli.Get(ctx, sts.Name, metav1.GetOptions{})
	if err == nil {
		sts.ResourceVersion = ex.ResourceVersion
		_, err = cli.Update(ctx, sts, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = cli.Create(ctx, sts, metav1.CreateOptions{})
		return err
	}
	return err
}
