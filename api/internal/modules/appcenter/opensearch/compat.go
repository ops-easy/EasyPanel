package opensearch

import (
	"context"

	sharedaudit "kube-bt-sync/common/audit"
	"kube-bt-sync/common/k8sutil"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
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
	sharedaudit.SetDetail(c, detail)
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

func int32Ptr(i int32) *int32 { return k8sutil.Int32Ptr(i) }

func firstNonEmpty(a, b string) string {
	return k8sutil.FirstNonEmpty(a, b)
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

func upsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
	return k8sutil.UpsertService(ctx, k8s, svc)
}

func upsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
	return k8sutil.UpsertDeployment(ctx, k8s, dep)
}

func upsertStatefulSet(ctx context.Context, k8s *kubernetes.Clientset, sts *appsv1.StatefulSet) error {
	return k8sutil.UpsertStatefulSet(ctx, k8s, sts)
}
