package service

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"strings"
	"sync"

	sharedaudit "kube-bt-sync/common/audit"
	sharedcrypto "kube-bt-sync/common/crypto"
	"kube-bt-sync/common/k8sutil"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV
type RedisLight = core.RedisLight
type OpsOpenClawBundle = core.OpsOpenClawBundle
type OpenClawConfig = core.OpenClawConfig

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

func appRedisMaskSensitive(eff *core.EffectiveDashboardPermissions) bool {
	return core.AppRedisMaskSensitive(eff)
}

func dashboardUsernameFromGin(c *gin.Context) string {
	return core.DashboardUsernameFromGin(c)
}

func SetAuditDetail(c *gin.Context, detail string) {
	sharedaudit.SetDetail(c, detail)
}

func verifyDashboardUserCurrentPassword(db *sql.DB, ctx context.Context, username, password string) error {
	return core.VerifyDashboardUserCurrentPassword(db, ctx, username, password)
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

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	core.MirrorPlatformKVIfDualWrite(app)
}

func GetPrometheusURLForScope(cfg Config, scope string) string {
	return core.GetPrometheusURLForScope(cfg, scope)
}

func PrometheusPromQLInstantScalar(cfg Config, scope, promQL string) *float64 {
	return core.PrometheusPromQLInstantScalar(cfg, scope, promQL)
}

func k8sExpandPVCStorage(ctx context.Context, k8s *kubernetes.Clientset, ns, pvcName, newSize string) error {
	return core.K8sExpandPVCStorage(ctx, k8s, ns, pvcName, newSize)
}

func NowBeijingRFC3339() string {
	return core.NowBeijingRFC3339()
}

func deploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	return k8sutil.DeploymentRolloutLooksReady(dep)
}

func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	return core.GuardK8s(c, k8s)
}

func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	return core.GuardK8sREST(c, k8s, rc)
}

func StreamK8sPodExecTTY(conn *websocket.Conn, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, command []string, mergeStderr bool) error {
	return core.StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, container, command, mergeStderr)
}

func normalizeModuleAccess(s string) string {
	return core.NormalizeModuleAccess(s)
}

func shellQuoteSingle(s string) string {
	return core.ShellQuoteSingle(s)
}

func classifyPVCExecEnvironmentError(err error, stderr string) (msg string, code string) {
	return core.ClassifyPVCExecEnvironmentError(err, stderr)
}

func truncateErrMessage(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "\u2026"
}

func opsEncryptionKey(cfg Config) ([]byte, error) {
	return core.OpsEncryptionKey(cfg)
}

func loadOpsOpenClawBundle(kv PlatformKV) (OpsOpenClawBundle, error) {
	return core.LoadOpsOpenClawBundle(kv)
}

func saveOpsOpenClawBundle(kv PlatformKV, b OpsOpenClawBundle) error {
	return core.SaveOpsOpenClawBundle(kv, b)
}

var execUpgrader = core.ExecUpgrader

func sshSessionApplyTermEnv(sess *ssh.Session, term string) {
	if sess == nil {
		return
	}
	t := strings.TrimSpace(term)
	if t == "" {
		t = "xterm-256color"
	}
	_ = sess.Setenv("TERM", t)
}

type wsBinaryWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsBinaryWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	err := w.conn.WriteMessage(websocket.BinaryMessage, p)
	if err != nil {
		return 0, err
	}
	return len(p), nil
}

func k8sPodExecRun(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, cmd []string, stdin io.Reader) (bytes.Buffer, bytes.Buffer, error) {
	return core.K8sPodExecRun(ctx, k8s, restCfg, ns, podName, container, cmd, stdin)
}
