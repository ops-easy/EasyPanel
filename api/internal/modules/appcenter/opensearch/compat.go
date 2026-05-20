package opensearch

import (
	"context"
	"strings"

	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type ServerApp = core.ServerApp

const (
	DashboardRoleAdmin             = core.DashboardRoleAdmin
	ModuleAccessNone               = core.ModuleAccessNone
	ModuleAccessRO                 = core.ModuleAccessRO
	AppCenterRedisScopeReadonly    = core.AppCenterRedisScopeReadonly
	AppCenterRedisScopeManagedOnly = core.AppCenterRedisScopeManagedOnly
)

func RespondAPIPermissionDenied(c *gin.Context) {
	core.RespondAPIPermissionDenied(c)
}

func RespondAPIError500(c *gin.Context, msg string) {
	core.RespondAPIError500(c, msg)
}

func RespondAPIErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	core.RespondAPIErrorMerged(c, status, msg, extra)
}

func getDashboardRoleFromGin(c *gin.Context) string {
	return core.DashboardRoleFromGin(c)
}

func getEffectiveDashboardPermissionsFromGin(c *gin.Context) *core.EffectiveDashboardPermissions {
	return core.EffectiveDashboardPermissionsFromGin(c)
}

func dashboardUsernameFromGin(c *gin.Context) string {
	return core.DashboardUsernameFromGin(c)
}

func SetAuditDetail(c *gin.Context, detail string) {
	core.SetAuditDetail(c, detail)
}

func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	return core.GuardK8s(c, k8s)
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func int32Ptr(i int32) *int32 { return &i }

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return strings.TrimSpace(a)
	}
	return strings.TrimSpace(b)
}

func ValidateK8sNamespaceName(ns string) error {
	return core.ValidateK8sNamespaceName(ns)
}

func ValidateK8sDeploymentName(name string) error {
	return core.ValidateK8sDeploymentName(name)
}

func ValidateOptionalK8sNodePort(field string, p int32) error {
	return core.ValidateOptionalK8sNodePort(field, p)
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
