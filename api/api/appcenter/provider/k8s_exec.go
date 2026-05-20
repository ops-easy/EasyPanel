package provider

import (
	"bytes"
	"context"
	"io"

	core "kube-bt-sync/common/core"
	"kube-bt-sync/common/k8sutil"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var ExecUpgrader = core.ExecUpgrader

func ExpandPVCStorage(ctx context.Context, k8s *kubernetes.Clientset, ns, pvcName, newSize string) error {
	return core.K8sExpandPVCStorage(ctx, k8s, ns, pvcName, newSize)
}

func DeploymentRolloutLooksReady(dep *appsv1.Deployment) bool {
	return k8sutil.DeploymentRolloutLooksReady(dep)
}

func GuardK8s(c *gin.Context, k8s *kubernetes.Clientset) bool {
	return core.GuardK8s(c, k8s)
}

func GuardK8sREST(c *gin.Context, k8s *kubernetes.Clientset, rc *rest.Config) bool {
	return core.GuardK8sREST(c, k8s, rc)
}

func StreamPodExecTTY(conn *websocket.Conn, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, command []string, mergeStderr bool) error {
	return core.StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, container, command, mergeStderr)
}

func PodExecRun(ctx context.Context, k8s *kubernetes.Clientset, restCfg *rest.Config, ns, podName, container string, cmd []string, stdin io.Reader) (bytes.Buffer, bytes.Buffer, error) {
	return core.K8sPodExecRun(ctx, k8s, restCfg, ns, podName, container, cmd, stdin)
}

func ShellQuoteSingle(s string) string {
	return core.ShellQuoteSingle(s)
}

func ClassifyPVCExecEnvironmentError(err error, stderr string) (msg string, code string) {
	return core.ClassifyPVCExecEnvironmentError(err, stderr)
}
