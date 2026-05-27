package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const (
	defaultAppMySQLImage         = "mysql:8.0"
	defaultAppMySQLExporterImage = "prom/mysqld-exporter:v0.15.1"
	appMySQLMetricsPort          = int32(9104)
	defaultAppMySQLCPURequest    = "250m"
	defaultAppMySQLCPULimit      = "1"
	defaultAppMySQLMemoryRequest = "512Mi"
	defaultAppMySQLMemoryLimit   = "1Gi"
)

type AppMySQLK8sDeployOpts struct {
	Namespace          string
	BaseName           string
	Version            string
	RootPassword       string
	Database           string
	AppUsername        string
	AppPassword        string
	PodPort            int32
	SvcPort            int32
	ServiceType        string
	NodePortMySQL      int32
	EnableExporter     bool
	MySQLImage         string
	ExporterImage      string
	ImagePullSecret    string
	PersistenceEnabled bool
	StorageSize        string
	StorageClassName   string
	MySQLCPURequest    string
	MySQLCPULimit      string
	MySQLMemoryRequest string
	MySQLMemoryLimit   string
	TemplateID         int64
	TemplateName       string
}

func ValidateAppMySQLK8sEngineLine(version string) error {
	v := strings.TrimSpace(version)
	if v == "" {
		return errors.New("version is required")
	}
	major := v
	if i := strings.IndexByte(v, '.'); i >= 0 {
		major = v[:i]
	}
	switch major {
	case "5", "8":
		return nil
	default:
		return errors.New("app-center MySQL K8s deploy supports MySQL 5.x and 8.x")
	}
}

func ValidateAppMySQLPassword(pw string) error {
	if strings.TrimSpace(pw) == "" {
		return errors.New("root password is required")
	}
	if len(pw) > 256 {
		return errors.New("password is too long")
	}
	return nil
}

func ResolveAppMySQLServerImage(_ Config, version, overrideFull string) string {
	if strings.TrimSpace(overrideFull) != "" {
		return strings.TrimSpace(overrideFull)
	}
	v := strings.TrimSpace(version)
	if v == "" {
		v = "8.0"
	}
	return "mysql:" + v
}

func ResolveAppMySQLExporterImage(_ Config, overrideFull string) string {
	if strings.TrimSpace(overrideFull) != "" {
		return strings.TrimSpace(overrideFull)
	}
	return defaultAppMySQLExporterImage
}

func appMySQLAuthSecretName(baseName string) string {
	suffix := "-auth"
	base := strings.TrimSpace(baseName) + suffix
	if len(base) <= 63 {
		return base
	}
	max := 63 - len(suffix)
	if max < 1 {
		return "mysql-auth"
	}
	return strings.TrimSpace(baseName)[:max] + suffix
}

func appMySQLDataPVCName(baseName string) string {
	s := strings.TrimSpace(baseName) + "-data"
	if len(s) <= 63 {
		return s
	}
	return s[:63]
}

func appMySQLLabels(baseName string) map[string]string {
	return map[string]string{
		"app":                strings.TrimSpace(baseName),
		"easypanel.io/mysql": "true",
	}
}

func buildAppMySQLAuthSecret(opts AppMySQLK8sDeployOpts) *corev1.Secret {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	data := map[string]string{
		"rootPassword": strings.TrimSpace(opts.RootPassword),
	}
	if strings.TrimSpace(opts.AppUsername) != "" {
		data["appUsername"] = strings.TrimSpace(opts.AppUsername)
	}
	if strings.TrimSpace(opts.AppPassword) != "" {
		data["appPassword"] = strings.TrimSpace(opts.AppPassword)
	}
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      appMySQLAuthSecretName(base),
			Namespace: ns,
			Labels:    appMySQLLabels(base),
		},
		Type:       corev1.SecretTypeOpaque,
		StringData: data,
	}
}

func buildAppMySQLDataPVC(opts AppMySQLK8sDeployOpts, storageClassName string) (*corev1.PersistentVolumeClaim, error) {
	size := strings.TrimSpace(opts.StorageSize)
	if size == "" {
		size = "10Gi"
	}
	return buildRedisPVC(
		strings.TrimSpace(opts.Namespace),
		appMySQLDataPVCName(opts.BaseName),
		storageClassName,
		size,
		map[string]string{"app": strings.TrimSpace(opts.BaseName), "easypanel.io/mysql-data": "true"},
	)
}

func appMySQLPasswordEnv(baseName string) []corev1.EnvVar {
	secretName := appMySQLAuthSecretName(baseName)
	return []corev1.EnvVar{
		{
			Name: "MYSQL_ROOT_PASSWORD",
			ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
				Key:                  "rootPassword",
			}},
		},
	}
}

func appMySQLMainContainer(opts AppMySQLK8sDeployOpts, image string) corev1.Container {
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 3306
	}
	env := appMySQLPasswordEnv(opts.BaseName)
	if db := strings.TrimSpace(opts.Database); db != "" {
		env = append(env, corev1.EnvVar{Name: "MYSQL_DATABASE", Value: db})
	}
	if strings.TrimSpace(opts.AppUsername) != "" {
		env = append(env, corev1.EnvVar{
			Name: "MYSQL_USER",
			ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: appMySQLAuthSecretName(opts.BaseName)},
				Key:                  "appUsername",
			}},
		})
	}
	if strings.TrimSpace(opts.AppPassword) != "" {
		env = append(env, corev1.EnvVar{
			Name: "MYSQL_PASSWORD",
			ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
				LocalObjectReference: corev1.LocalObjectReference{Name: appMySQLAuthSecretName(opts.BaseName)},
				Key:                  "appPassword",
			}},
		})
	}
	c := corev1.Container{
		Name:  "mysql",
		Image: image,
		Ports: []corev1.ContainerPort{{Name: "mysql", ContainerPort: podPort}},
		Env:   env,
		VolumeMounts: []corev1.VolumeMount{{
			Name: "mysql-data", MountPath: "/var/lib/mysql",
		}},
	}
	addResources := func(dst *corev1.ResourceList, name corev1.ResourceName, value string) {
		qty, err := parseQty(value)
		if err != nil {
			return
		}
		if *dst == nil {
			*dst = corev1.ResourceList{}
		}
		(*dst)[name] = qty
	}
	addResources(&c.Resources.Requests, corev1.ResourceCPU, firstNonEmpty(opts.MySQLCPURequest, defaultAppMySQLCPURequest))
	addResources(&c.Resources.Limits, corev1.ResourceCPU, firstNonEmpty(opts.MySQLCPULimit, defaultAppMySQLCPULimit))
	addResources(&c.Resources.Requests, corev1.ResourceMemory, firstNonEmpty(opts.MySQLMemoryRequest, defaultAppMySQLMemoryRequest))
	addResources(&c.Resources.Limits, corev1.ResourceMemory, firstNonEmpty(opts.MySQLMemoryLimit, defaultAppMySQLMemoryLimit))
	return c
}

func appMySQLExporterContainer(cfg Config, opts AppMySQLK8sDeployOpts) corev1.Container {
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 3306
	}
	c := corev1.Container{
		Name:    "mysql-exporter",
		Image:   ResolveAppMySQLExporterImage(cfg, opts.ExporterImage),
		Command: []string{"/bin/sh", "-c"},
		Args: []string{
			fmt.Sprintf(`export DATA_SOURCE_NAME="root:${MYSQL_ROOT_PASSWORD}@(127.0.0.1:%d)/"; exec /bin/mysqld_exporter`, podPort),
		},
		Ports: []corev1.ContainerPort{{Name: "metrics", ContainerPort: appMySQLMetricsPort}},
		Env:   appMySQLPasswordEnv(opts.BaseName),
	}
	c.Resources = exporterSidecarResources()
	return c
}

func buildAppMySQLDeployment(cfg Config, opts AppMySQLK8sDeployOpts, dataPVCClaimName string) *appsv1.Deployment {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	labels := appMySQLLabels(base)
	containers := []corev1.Container{appMySQLMainContainer(opts, ResolveAppMySQLServerImage(cfg, opts.Version, opts.MySQLImage))}
	if opts.EnableExporter {
		containers = append(containers, appMySQLExporterContainer(cfg, opts))
	}
	annotations := map[string]string{}
	if opts.EnableExporter {
		annotations["prometheus.io/scrape"] = "true"
		annotations["prometheus.io/port"] = fmt.Sprintf("%d", appMySQLMetricsPort)
		annotations["prometheus.io/path"] = "/metrics"
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: base, Namespace: ns, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels, Annotations: annotations},
				Spec: corev1.PodSpec{
					Containers:       containers,
					ImagePullSecrets: ImagePullSecretsForRedisDeploy(cfg, opts.ImagePullSecret),
					Volumes: []corev1.Volume{{
						Name: "mysql-data",
						VolumeSource: corev1.VolumeSource{
							PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: dataPVCClaimName},
						},
					}},
				},
			},
		},
	}
}

func buildAppMySQLService(opts AppMySQLK8sDeployOpts) *corev1.Service {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	podPort := opts.PodPort
	if podPort <= 0 {
		podPort = 3306
	}
	svcPort := opts.SvcPort
	if svcPort <= 0 {
		svcPort = 3306
	}
	ports := []corev1.ServicePort{{
		Name:       "mysql",
		Port:       svcPort,
		Protocol:   corev1.ProtocolTCP,
		TargetPort: intstr.FromInt32(podPort),
	}}
	if opts.EnableExporter {
		ports = append(ports, corev1.ServicePort{
			Name:       "metrics",
			Port:       appMySQLMetricsPort,
			Protocol:   corev1.ProtocolTCP,
			TargetPort: intstr.FromInt32(appMySQLMetricsPort),
		})
	}
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: base, Namespace: ns, Labels: appMySQLLabels(base)},
		Spec: corev1.ServiceSpec{
			Type:     redisK8sServiceTypeFromString(opts.ServiceType),
			Selector: appMySQLLabels(base),
			Ports:    ports,
		},
	}
	applyExplicitNodePorts(svc, opts.NodePortMySQL, 0)
	return svc
}

func EnsureAppMySQLK8sDeployNoNameConflict(ctx context.Context, k8s *kubernetes.Clientset, opts AppMySQLK8sDeployOpts) error {
	ns := strings.TrimSpace(opts.Namespace)
	base := strings.TrimSpace(opts.BaseName)
	if ns == "" || base == "" || k8s == nil {
		return nil
	}
	if _, err := k8s.AppsV1().Deployments(ns).Get(ctx, base, metav1.GetOptions{}); err == nil {
		return fmt.Errorf("namespace %s already has Deployment %s", ns, base)
	} else if !apierrors.IsNotFound(err) {
		return fmt.Errorf("check Deployment: %w", err)
	}
	return nil
}

func ApplyAppMySQLK8sDeploy(ctx context.Context, k8s *kubernetes.Clientset, cfg Config, opts AppMySQLK8sDeployOpts) error {
	if k8s == nil {
		return errors.New("kubernetes is not connected")
	}
	if err := ValidateK8sNamespaceName(opts.Namespace); err != nil {
		return err
	}
	if err := ValidateK8sDeploymentName(opts.BaseName); err != nil {
		return err
	}
	if err := ValidateAppMySQLK8sEngineLine(firstNonEmpty(opts.Version, "8.0")); err != nil {
		return err
	}
	if err := ValidateAppMySQLPassword(opts.RootPassword); err != nil {
		return err
	}
	if err := validateK8sPort("pod port", opts.PodPort); err != nil {
		return err
	}
	if err := validateK8sPort("service port", opts.SvcPort); err != nil {
		return err
	}
	if err := ValidateOptionalK8sNodePort("MySQL NodePort", opts.NodePortMySQL); err != nil {
		return err
	}
	if err := applySecret(ctx, k8s, buildAppMySQLAuthSecret(opts)); err != nil {
		return fmt.Errorf("secret: %w", err)
	}
	storageClass := strings.TrimSpace(opts.StorageClassName)
	if opts.PersistenceEnabled && storageClass == "" {
		sc, err := ResolveRedisK8sStorageClass(ctx, k8s, "")
		if err != nil {
			return fmt.Errorf("storage class: %w", err)
		}
		storageClass = sc
	}
	pvc, err := buildAppMySQLDataPVC(opts, storageClass)
	if err != nil {
		return fmt.Errorf("pvc: %w", err)
	}
	if err := applyPVC(ctx, k8s, pvc); err != nil {
		return fmt.Errorf("pvc: %w", err)
	}
	if err := upsertDeployment(ctx, k8s, buildAppMySQLDeployment(cfg, opts, pvc.Name)); err != nil {
		return fmt.Errorf("deployment: %w", err)
	}
	if err := upsertService(ctx, k8s, buildAppMySQLService(opts)); err != nil {
		return fmt.Errorf("service: %w", err)
	}
	return nil
}
