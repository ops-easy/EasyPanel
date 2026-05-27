package service

import (
	"context"
	"errors"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	apiresource "k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes"
)

const (
	hermesGatewayPort   = int32(8642)
	hermesDashboardPort = int32(9119)
	hermesDefaultImage  = "nousresearch/hermes-agent:latest"
)

func hermesDefaultResources() corev1.ResourceRequirements {
	return corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    apiresource.MustParse("250m"),
			corev1.ResourceMemory: apiresource.MustParse("512Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    apiresource.MustParse("1"),
			corev1.ResourceMemory: apiresource.MustParse("1Gi"),
		},
	}
}

type HermesK8sDeployOpts struct {
	Namespace      string
	DeploymentName string
	ServiceName    string
	Image          string
	Mode           string
	PVCName        string
	SecretName     string
	ConfigMapName  string
	StorageSize    string
	ExposeMode     string
	NodePort       int32
	Replicas       int32
}

func hermesLabels(name string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "hermes-agent",
		"app.kubernetes.io/managed-by": "easypanel",
		"app.kubernetes.io/instance":   name,
	}
}

func hermesRuntimeHome(name string) string {
	switch name {
	case "gateway":
		return "/opt/data/gateway"
	case "dashboard":
		return "/opt/data/dashboard"
	default:
		return "/opt/data/" + strings.TrimSpace(name)
	}
}

func hermesRuntimeVolumeName(name string) string {
	return "hermes-" + strings.TrimSpace(name) + "-data"
}

func hermesContainer(name string, args []string, image, secretName, configMapName, mode string) corev1.Container {
	home := hermesRuntimeHome(name)
	image = normalizeHermesImage(image)
	env := []corev1.EnvVar{
		{Name: "HOME", Value: home},
		{Name: "HERMES_HOME", Value: home},
	}
	if mode == "gateway" || mode == "gateway-dashboard" {
		env = append(env,
			corev1.EnvVar{Name: "API_SERVER_ENABLED", Value: "true"},
			corev1.EnvVar{Name: "API_SERVER_HOST", Value: "0.0.0.0"},
			corev1.EnvVar{Name: "API_SERVER_PORT", Value: "8642"},
			corev1.EnvVar{
				Name: "API_SERVER_KEY",
				ValueFrom: &corev1.EnvVarSource{SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{Name: secretName},
					Key:                  "API_SERVER_KEY",
					Optional:             hermesBoolPtr(true),
				}},
			},
		)
	}
	ports := []corev1.ContainerPort{}
	if mode == "gateway" || mode == "gateway-dashboard" {
		ports = append(ports, corev1.ContainerPort{Name: "gateway", ContainerPort: hermesGatewayPort, Protocol: corev1.ProtocolTCP})
	}
	if mode == "dashboard" || mode == "gateway-dashboard" {
		ports = append(ports, corev1.ContainerPort{Name: "dashboard", ContainerPort: hermesDashboardPort, Protocol: corev1.ProtocolTCP})
	}
	return corev1.Container{
		Name:            name,
		Image:           image,
		ImagePullPolicy: corev1.PullIfNotPresent,
		Args:            append([]string(nil), args...),
		Env:             env,
		Ports:           ports,
		EnvFrom: []corev1.EnvFromSource{
			{SecretRef: &corev1.SecretEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: secretName}, Optional: hermesBoolPtr(true)}},
			{ConfigMapRef: &corev1.ConfigMapEnvSource{LocalObjectReference: corev1.LocalObjectReference{Name: configMapName}, Optional: hermesBoolPtr(true)}},
		},
		Resources: hermesDefaultResources(),
		VolumeMounts: []corev1.VolumeMount{
			{Name: hermesRuntimeVolumeName(name), MountPath: home},
		},
	}
}

func buildHermesDeployment(opts HermesK8sDeployOpts) (*appsv1.Deployment, error) {
	mode, err := normalizeHermesMode(opts.Mode)
	if err != nil {
		return nil, err
	}
	ns := strings.TrimSpace(opts.Namespace)
	name := strings.TrimSpace(opts.DeploymentName)
	image := normalizeHermesImage(opts.Image)
	if ns == "" || name == "" || image == "" {
		return nil, errors.New("namespace、deploymentName、image 不能为空")
	}
	pvc := strings.TrimSpace(opts.PVCName)
	if pvc == "" {
		pvc = name + "-home"
	}
	secret := strings.TrimSpace(opts.SecretName)
	if secret == "" {
		secret = name + "-secrets"
	}
	cm := strings.TrimSpace(opts.ConfigMapName)
	if cm == "" {
		cm = name + "-config"
	}
	containers := []corev1.Container{}
	switch mode {
	case "gateway":
		containers = append(containers, hermesContainer("gateway", []string{"gateway", "run"}, image, secret, cm, mode))
	case "dashboard":
		containers = append(containers, hermesContainer("dashboard", []string{"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"}, image, secret, cm, mode))
	case "gateway-dashboard":
		containers = append(containers,
			hermesContainer("gateway", []string{"gateway", "run"}, image, secret, cm, "gateway"),
			hermesContainer("dashboard", []string{"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"}, image, secret, cm, "dashboard"),
		)
	}
	labels := hermesLabels(name)
	replicas := opts.Replicas
	if replicas == 0 {
		replicas = 1
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: ns, Labels: labels},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: containers,
					Volumes: append([]corev1.Volume{
						{
							Name: "hermes-home",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: pvc},
							},
						},
					}, hermesRuntimeVolumes(containers)...),
				},
			},
		},
	}, nil
}

func hermesRuntimeVolumes(containers []corev1.Container) []corev1.Volume {
	out := make([]corev1.Volume, 0, len(containers))
	seen := map[string]bool{}
	for _, c := range containers {
		name := hermesRuntimeVolumeName(c.Name)
		if seen[name] {
			continue
		}
		seen[name] = true
		out = append(out, corev1.Volume{Name: name, VolumeSource: corev1.VolumeSource{EmptyDir: &corev1.EmptyDirVolumeSource{}}})
	}
	return out
}

func buildHermesPVC(opts HermesK8sDeployOpts) *corev1.PersistentVolumeClaim {
	size := strings.TrimSpace(opts.StorageSize)
	if size == "" {
		size = "10Gi"
	}
	name := strings.TrimSpace(opts.PVCName)
	if name == "" {
		name = strings.TrimSpace(opts.DeploymentName) + "-home"
	}
	return &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: opts.Namespace, Labels: hermesLabels(opts.DeploymentName)},
		Spec: corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.ResourceRequirements{
				Requests: corev1.ResourceList{corev1.ResourceStorage: apiresource.MustParse(size)},
			},
		},
	}
}

func buildHermesService(opts HermesK8sDeployOpts) *corev1.Service {
	name := strings.TrimSpace(opts.ServiceName)
	if name == "" {
		name = strings.TrimSpace(opts.DeploymentName)
	}
	mode, _ := normalizeHermesMode(opts.Mode)
	ports := []corev1.ServicePort{}
	if mode == "gateway" || mode == "gateway-dashboard" {
		ports = append(ports, corev1.ServicePort{Name: "gateway", Port: hermesGatewayPort, TargetPort: intstr.FromInt(int(hermesGatewayPort))})
	}
	if mode == "dashboard" || mode == "gateway-dashboard" {
		ports = append(ports, corev1.ServicePort{Name: "dashboard", Port: hermesDashboardPort, TargetPort: intstr.FromInt(int(hermesDashboardPort))})
	}
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: opts.Namespace, Labels: hermesLabels(opts.DeploymentName)},
		Spec: corev1.ServiceSpec{
			Type:     hermesServiceTypeFromExposeMode(opts.ExposeMode),
			Selector: hermesLabels(opts.DeploymentName),
			Ports:    ports,
		},
	}
	if opts.NodePort > 0 && svc.Spec.Type == corev1.ServiceTypeNodePort && len(svc.Spec.Ports) > 0 {
		svc.Spec.Ports[0].NodePort = opts.NodePort
	}
	return svc
}

func hermesServiceTypeFromExposeMode(mode string) corev1.ServiceType {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "nodeport", "node-port":
		return corev1.ServiceTypeNodePort
	case "loadbalancer", "load-balancer":
		return corev1.ServiceTypeLoadBalancer
	default:
		return corev1.ServiceTypeClusterIP
	}
}

func buildHermesConfigMap(opts HermesK8sDeployOpts, provider, model string) *corev1.ConfigMap {
	name := strings.TrimSpace(opts.ConfigMapName)
	if name == "" {
		name = strings.TrimSpace(opts.DeploymentName) + "-config"
	}
	data := map[string]string{}
	if strings.TrimSpace(provider) != "" {
		data["HERMES_MODEL_PROVIDER"] = strings.TrimSpace(provider)
	}
	if strings.TrimSpace(model) != "" {
		data["HERMES_MODEL_NAME"] = strings.TrimSpace(model)
	}
	data["EASYPANEL_HERMES_MODE"] = strings.TrimSpace(opts.Mode)
	return &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: opts.Namespace, Labels: hermesLabels(opts.DeploymentName)},
		Data:       data,
	}
}

func buildHermesSecret(opts HermesK8sDeployOpts, data map[string]string) *corev1.Secret {
	name := strings.TrimSpace(opts.SecretName)
	if name == "" {
		name = strings.TrimSpace(opts.DeploymentName) + "-secrets"
	}
	out := map[string]string{}
	for k, v := range data {
		key := strings.TrimSpace(k)
		if key == "" {
			continue
		}
		out[key] = v
	}
	return &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: opts.Namespace, Labels: hermesLabels(opts.DeploymentName)},
		Type:       corev1.SecretTypeOpaque,
		StringData: out,
	}
}

func applyConfigMap(ctx context.Context, k8s *kubernetes.Clientset, cm *corev1.ConfigMap) error {
	cli := k8s.CoreV1().ConfigMaps(cm.Namespace)
	ex, err := cli.Get(ctx, cm.Name, metav1.GetOptions{})
	if err == nil {
		cm.ResourceVersion = ex.ResourceVersion
		_, err = cli.Update(ctx, cm, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = cli.Create(ctx, cm, metav1.CreateOptions{})
		return err
	}
	return err
}

func hermesBoolPtr(v bool) *bool {
	return &v
}
