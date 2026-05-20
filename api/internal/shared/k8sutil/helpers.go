package k8sutil

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

var dnsLabelRe = regexp.MustCompile(`^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`)

func FirstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return strings.TrimSpace(b)
}

func Int32Ptr(i int32) *int32 { return &i }

func ValidateNamespaceName(ns string) error {
	ns = strings.TrimSpace(ns)
	if ns == "" {
		return errors.New("命名空间不能为空")
	}
	if len(ns) > 63 {
		return errors.New("命名空间名称长度不能超过 63")
	}
	if !dnsLabelRe.MatchString(ns) {
		return errors.New("命名空间格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

func ValidateDeploymentName(name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("Deployment 名称不能为空")
	}
	if len(name) > 63 {
		return errors.New("Deployment 名称长度不能超过 63")
	}
	if !dnsLabelRe.MatchString(name) {
		return errors.New("Deployment 名称格式无效（须为小写字母、数字与连字符组成的 DNS 标签）")
	}
	return nil
}

func ValidateOptionalNodePort(field string, p int32) error {
	if p == 0 {
		return nil
	}
	if p < 30000 || p > 32767 {
		return fmt.Errorf("%s 须为 0（自动）或 30000–32767", field)
	}
	return nil
}

func EnsureNamespace(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
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

func ResolveStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
	if strings.TrimSpace(userOrCfg) != "" {
		return strings.TrimSpace(userOrCfg), nil
	}
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

func ParseStorageSize(s string) (resource.Quantity, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		s = "10Gi"
	}
	return resource.ParseQuantity(s)
}

func BuildRWOPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	qty, err := ParseStorageSize(size)
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

func ApplyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
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

func UpsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
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

func UpsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
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

func UpsertStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
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

func DeploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	if dep == nil {
		return false
	}
	want := int32(1)
	if dep.Spec.Replicas != nil {
		want = *dep.Spec.Replicas
	}
	if dep.Status.ObservedGeneration < dep.Generation {
		return false
	}
	if dep.Status.UpdatedReplicas < want {
		return false
	}
	if dep.Status.ReadyReplicas < want {
		return false
	}
	if dep.Status.AvailableReplicas < want {
		return false
	}
	return true
}

func NodePrimaryIP(n *corev1.Node) string {
	if n == nil {
		return ""
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeExternalIP && a.Address != "" {
			return a.Address
		}
	}
	for _, a := range n.Status.Addresses {
		if a.Type == corev1.NodeInternalIP && a.Address != "" {
			return a.Address
		}
	}
	return ""
}

func FirstNodeAccessIP(ctx context.Context, k8s *kubernetes.Clientset) string {
	nodes, err := k8s.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil || len(nodes.Items) == 0 {
		return ""
	}
	return NodePrimaryIP(&nodes.Items[0])
}

func NodeAccessIPForNodeName(ctx context.Context, k8s *kubernetes.Clientset, name string) string {
	name = strings.TrimSpace(name)
	if name == "" || k8s == nil {
		return ""
	}
	n, err := k8s.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
	if err != nil || n == nil {
		return ""
	}
	return NodePrimaryIP(n)
}
