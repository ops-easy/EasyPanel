package cloudvm

import (
	"bytes"
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
	"sync"

	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
	core.SetAuditDetail(c, detail)
}

func verifyDashboardUserCurrentPassword(db *sql.DB, ctx context.Context, username, password string) error {
	return core.VerifyDashboardUserCurrentPassword(db, ctx, username, password)
}

func sshEncryptionKey(cfg Config) ([]byte, error) {
	return core.SSHEncryptionKey(cfg)
}

func decryptSecret(key []byte, encoded string) (string, error) {
	return core.DecryptSecret(key, encoded)
}

func encryptSecret(key []byte, plaintext string) (string, error) {
	return core.EncryptSecret(key, plaintext)
}

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	core.MirrorPlatformKVIfDualWrite(app)
}

func ValidateOptionalK8sNodePort(field string, p int32) error {
	return core.ValidateOptionalK8sNodePort(field, p)
}

func ResolveRedisK8sStorageClass(ctx context.Context, k8s *kubernetes.Clientset, userOrCfg string) (string, error) {
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

func GetPrometheusURLForScope(cfg Config, scope string) string {
	return core.GetPrometheusURLForScope(cfg, scope)
}

func PrometheusPromQLInstantScalar(cfg Config, scope, promQL string) *float64 {
	return core.PrometheusPromQLInstantScalar(cfg, scope, promQL)
}

func k8sExpandPVCStorage(ctx context.Context, k8s *kubernetes.Clientset, ns, pvcName, newSize string) error {
	return core.K8sExpandPVCStorage(ctx, k8s, ns, pvcName, newSize)
}

func parseStorageSize(s string) (resource.Quantity, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		s = "10Gi"
	}
	return resource.ParseQuantity(s)
}

func buildRedisPVC(ns, name string, storageClassName string, size string, labels map[string]string) (*corev1.PersistentVolumeClaim, error) {
	qty, err := parseStorageSize(size)
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

func applyPVC(ctx context.Context, k8s *kubernetes.Clientset, pvc *corev1.PersistentVolumeClaim) error {
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

func int32Ptr(i int32) *int32 { return &i }

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
