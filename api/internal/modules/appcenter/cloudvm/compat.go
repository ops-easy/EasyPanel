package cloudvm

import (
	"bytes"
	"context"
	"database/sql"
	"io"
	"strings"
	"sync"

	core "kube-bt-sync/internal"
	sharedaudit "kube-bt-sync/internal/shared/audit"
	sharedcrypto "kube-bt-sync/internal/shared/crypto"
	"kube-bt-sync/internal/shared/k8sutil"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV

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

func ValidateOptionalK8sNodePort(field string, p int32) error {
	return k8sutil.ValidateOptionalNodePort(field, p)
}

func ResolveRedisK8sStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
	return k8sutil.ResolveStorageClass(ctx, k8s, userOrCfg)
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

func buildRedisPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	return k8sutil.BuildRWOPVC(ns, name, storageClassName, size, labels)
}

func applyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
	return k8sutil.ApplyPVC(ctx, k8s, pvc)
}

func upsertService(ctx context.Context, k8s *kubernetes.Clientset, svc *corev1.Service) error {
	return k8sutil.UpsertService(ctx, k8s, svc)
}

func upsertDeployment(ctx context.Context, k8s *kubernetes.Clientset, dep *appsv1.Deployment) error {
	return k8sutil.UpsertDeployment(ctx, k8s, dep)
}

func int32Ptr(i int32) *int32 { return k8sutil.Int32Ptr(i) }

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
