package service

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"strings"
	"sync"
	"time"

	appcentermodel "github.com/ops-easy/EasyPanel/backend/api/appcenter/model"
	appcenterprovider "github.com/ops-easy/EasyPanel/backend/api/appcenter/provider"
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	sharedaudit "github.com/ops-easy/EasyPanel/backend/common/audit"
	"github.com/ops-easy/EasyPanel/backend/common/authz"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"
	"github.com/ops-easy/EasyPanel/backend/common/result"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ServerApp = appctx.ServerApp
type Config = appctx.Config
type PlatformKV = appctx.PlatformKV
type RedisLight = appctx.RedisLight
type OpsAIProviderBundle = appcentermodel.OpsAIProviderBundle
type OpsAIProviderEndpoint = appcentermodel.OpsAIProviderEndpoint

const (
	DashboardRoleAdmin             = authz.DashboardRoleAdmin
	DashboardRoleViewer            = authz.DashboardRoleViewer
	ModuleAccessNone               = authz.ModuleAccessNone
	ModuleAccessRO                 = authz.ModuleAccessRO
	ModuleAccessRW                 = authz.ModuleAccessRW
	AppCenterRedisScopeFull        = "full"
	AppCenterRedisScopeReadonly    = "readonly"
	AppCenterRedisScopeManagedOnly = "managed_only"
	APIErrorPermissionDenied       = result.APIErrorPermissionDenied
)

func RespondAPIPermissionDenied(c *gin.Context) {
	result.PermissionDenied(c)
}

func RespondAPIError500(c *gin.Context, msg string) {
	result.Error500(c, msg)
}

func RespondAPIErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	result.ErrorMerged(c, status, msg, extra)
}

func getDashboardRoleFromGin(c *gin.Context) string {
	return authz.DashboardRoleFromGin(c)
}

func getEffectiveDashboardPermissionsFromGin(c *gin.Context) *authz.EffectiveDashboardPermissions {
	return authz.EffectiveDashboardPermissionsFromGin(c)
}

func appRedisMaskSensitive(eff *authz.EffectiveDashboardPermissions) bool {
	return authz.AppRedisMaskSensitive(eff)
}

func dashboardUsernameFromGin(c *gin.Context) string {
	return authz.DashboardUsernameFromGin(c)
}

func SetAuditDetail(c *gin.Context, detail string) {
	sharedaudit.SetDetail(c, detail)
}

func verifyDashboardUserCurrentPassword(db *sql.DB, ctx context.Context, username, password string) error {
	return authz.VerifyDashboardUserCurrentPassword(db, ctx, username, password)
}

func sshEncryptionKey(cfg Config) ([]byte, error) {
	return sharedcrypto.DeriveAESKey(cfg.EncryptionKey)
}

func decryptSecret(key []byte, encoded string) (string, error) {
	return sharedcrypto.DecryptSecret(key, encoded)
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	return sharedcrypto.EncryptSecret(key, plaintext)
}

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	appctx.MirrorPlatformKVIfDualWrite(app)
}

func GetPrometheusURLForScope(cfg Config, scope string) string {
	return appcenterprovider.GetPrometheusURLForScope(cfg, scope)
}

func PrometheusPromQLInstantScalar(cfg Config, scope, promQL string) *float64 {
	return appcenterprovider.PrometheusPromQLInstantScalar(cfg, scope, promQL)
}

func k8sExpandPVCStorage(ctx context.Context, k8s *kubernetes.Clientset, ns, pvcName, newSize string) error {
	return appcenterprovider.ExpandPVCStorage(ctx, k8s, ns, pvcName, newSize)
}

func NowBeijingRFC3339() string {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format(time.RFC3339Nano)
}

func deploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	return appcenterprovider.DeploymentRolloutLooksReady(dep)
}

func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	return appcenterprovider.GuardK8s(c, k8s)
}

func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	return appcenterprovider.GuardK8sREST(c, k8s, rc)
}

func StreamK8sPodExecTTY(conn *websocket.Conn, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, command []string, mergeStderr bool) error {
	return appcenterprovider.StreamPodExecTTY(conn, k8s, restCfg, ns, podName, container, command, mergeStderr)
}

func normalizeModuleAccess(s string) string {
	return authz.NormalizeModuleAccess(s)
}

func shellQuoteSingle(s string) string {
	return appcenterprovider.ShellQuoteSingle(s)
}

func classifyPVCExecEnvironmentError(err error, stderr string) (msg string, code string) {
	return appcenterprovider.ClassifyPVCExecEnvironmentError(err, stderr)
}

func truncateErrMessage(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max] + "\u2026"
}

func opsEncryptionKey(cfg Config) ([]byte, error) {
	return appcenterprovider.OpsEncryptionKey(cfg)
}

func loadOpsAIProviderBundle(kv PlatformKV) (OpsAIProviderBundle, error) {
	return appcenterprovider.LoadOpsAIProviderBundle(kv)
}

func saveOpsAIProviderBundle(kv PlatformKV, b OpsAIProviderBundle) error {
	return appcenterprovider.SaveOpsAIProviderBundle(kv, b)
}

var execUpgrader = appcenterprovider.ExecUpgrader

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
	return appcenterprovider.PodExecRun(ctx, k8s, restCfg, ns, podName, container, cmd, stdin)
}
