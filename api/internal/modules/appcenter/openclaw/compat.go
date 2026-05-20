package openclaw

import (
	"bytes"
	"context"
	"io"

	cloudvm "kube-bt-sync/api/appcenter/service"
	sharedaudit "kube-bt-sync/common/audit"
	sharedcrypto "kube-bt-sync/common/crypto"
	"kube-bt-sync/common/k8sutil"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV
type OpsOpenClawBundle = core.OpsOpenClawBundle
type OpenClawConfig = core.OpenClawConfig
type CloudVMBootstrap = cloudvm.CloudVMBootstrap
type CloudVMStored = cloudvm.CloudVMStored

const (
	DashboardRoleAdmin             = core.DashboardRoleAdmin
	DashboardRoleViewer            = core.DashboardRoleViewer
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

func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	return core.GuardK8sREST(c, k8s, rc)
}

func ValidateOptionalK8sNodePort(field string, p int32) error {
	return k8sutil.ValidateOptionalNodePort(field, p)
}

func ValidateK8sDeploymentName(name string) error {
	return k8sutil.ValidateDeploymentName(name)
}

func NowBeijingRFC3339() string {
	return core.NowBeijingRFC3339()
}

func deploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	return k8sutil.DeploymentRolloutLooksReady(dep)
}

func ensureNamespace(ctx context.Context, k8s *kubernetes.Clientset, name string) error {
	return k8sutil.EnsureNamespace(ctx, k8s, name)
}

func CloudVMHysteria2ClusterEndpoint(ns, depName string, port int) string {
	return cloudvm.CloudVMHysteria2ClusterEndpoint(ns, depName, port)
}

func CloudVMExecGoogle204Check(ctx context.Context, k8s *kubernetes.Clientset, rc *rest.Config, ns, depName string, sw cloudvm.CloudVMSoftwareOpts) (ok bool, detail string) {
	return cloudvm.CloudVMExecGoogle204Check(ctx, k8s, rc, ns, depName, sw)
}

func normalizeModuleAccess(s string) string {
	return core.NormalizeModuleAccess(s)
}

func shellQuoteSingle(s string) string {
	return core.ShellQuoteSingle(s)
}

func k8sPodExecRun(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, cmd []string, stdin io.Reader) (bytes.Buffer, bytes.Buffer, error) {
	return core.K8sPodExecRun(ctx, k8s, restCfg, ns, podName, container, cmd, stdin)
}

func classifyPVCExecEnvironmentError(err error, stderr string) (msg string, code string) {
	return core.ClassifyPVCExecEnvironmentError(err, stderr)
}

func appCloudVMWriteDenied(c *gin.Context) bool {
	if getDashboardRoleFromGin(c) == DashboardRoleAdmin {
		return false
	}
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		return true
	}
	if eff.AppCenter == ModuleAccessNone || eff.AppCenter == ModuleAccessRO {
		return true
	}
	cs := eff.AppCenterCloudVm
	if cs == "" {
		cs = eff.AppCenterRedis
	}
	if cs == AppCenterRedisScopeReadonly {
		return true
	}
	if cs == AppCenterRedisScopeManagedOnly {
		return true
	}
	return false
}

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	core.MirrorPlatformKVIfDualWrite(app)
}

func truncateErrMessage(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func opsEncryptionKey(cfg Config) ([]byte, error) {
	return core.OpsEncryptionKey(cfg)
}

func decryptSecret(key []byte, encoded string) (string, error) {
	return sharedcrypto.DecryptSecret(key, encoded)
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	return sharedcrypto.EncryptSecret(key, plaintext)
}

func loadOpsOpenClawBundle(kv PlatformKV) (OpsOpenClawBundle, error) {
	return core.LoadOpsOpenClawBundle(kv)
}

func saveOpsOpenClawBundle(kv PlatformKV, b OpsOpenClawBundle) error {
	return core.SaveOpsOpenClawBundle(kv, b)
}

func loadCloudVMBootstrap(kv PlatformKV) *CloudVMBootstrap {
	return cloudvm.LoadCloudVMBootstrap(kv)
}

func firstNodeAccessIP(ctx context.Context, k8s *kubernetes.Clientset) string {
	return k8sutil.FirstNodeAccessIP(ctx, k8s)
}

func nodePrimaryIP(n *corev1.Node) string {
	return k8sutil.NodePrimaryIP(n)
}

func nodeAccessIPForNodeName(ctx context.Context, k8s *kubernetes.Clientset, name string) string {
	return k8sutil.NodeAccessIPForNodeName(ctx, k8s, name)
}
