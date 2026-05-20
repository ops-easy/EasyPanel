package redis

import (
	sharedaudit "kube-bt-sync/common/audit"
	sharedcrypto "kube-bt-sync/common/crypto"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV
type RedisLight = core.RedisLight

const (
	DashboardRoleAdmin             = core.DashboardRoleAdmin
	DashboardRoleViewer            = core.DashboardRoleViewer
	ModuleAccessNone               = core.ModuleAccessNone
	ModuleAccessRO                 = core.ModuleAccessRO
	ModuleAccessRW                 = core.ModuleAccessRW
	AppCenterRedisScopeFull        = core.AppCenterRedisScopeFull
	AppCenterRedisScopeReadonly    = core.AppCenterRedisScopeReadonly
	AppCenterRedisScopeManagedOnly = core.AppCenterRedisScopeManagedOnly
	APIErrorPermissionDenied       = core.APIErrorPermissionDenied
)

func RespondAPIError500(c *gin.Context, msg string) {
	core.RespondAPIError500(c, msg)
}

func RespondAPIPermissionDenied(c *gin.Context) {
	core.RespondAPIPermissionDenied(c)
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

func appRedisMaskSensitive(eff *core.EffectiveDashboardPermissions) bool {
	return core.AppRedisMaskSensitive(eff)
}

func SetAuditDetail(c *gin.Context, detail string) {
	sharedaudit.SetDetail(c, detail)
}

func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	return core.GuardK8s(c, k8s)
}

func sshEncryptionKey(cfg Config) ([]byte, error) {
	return core.SSHEncryptionKey(cfg)
}

func decryptSecret(key []byte, encoded string) (string, error) {
	return sharedcrypto.DecryptSecret(key, encoded)
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	return sharedcrypto.EncryptSecret(key, plaintext)
}

func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	return core.GuardK8sREST(c, k8s, rc)
}

var execUpgrader = core.ExecUpgrader

func StreamK8sPodExecTTY(conn *websocket.Conn, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, command []string, mergeStderr bool) error {
	return core.StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, container, command, mergeStderr)
}
