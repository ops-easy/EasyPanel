package service

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type hermesUpgradeBody struct {
	Image    string `json:"image"`
	Replicas int32  `json:"replicas"`
}

func handleAppHermesUpgrade(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	if !requireAppCenterMutationConfirm(c, appCenterMutationConfirmed(c.Query("confirm")), "Hermes upgrade") {
		return
	}
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	var body hermesUpgradeBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	image := normalizeHermesImage(body.Image)
	if image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "升级 Hermes 必须填写 image"})
		return
	}
	replicas := body.Replicas
	if replicas == 0 {
		replicas = firstNonZeroInt32(inst.Replicas, 1)
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := patchHermesDeploymentImage(ctx, app, *inst, image, replicas); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	saved, err := patchHermesInstance(app.PlatformKV(), inst.ID, func(x *HermesInstance) {
		x.PreviousImage = x.Image
		x.Image = image
		x.Replicas = replicas
		x.Ready = false
		x.LastProbeError = "升级后等待重新探测"
	})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, "应用中心 Hermes 升级镜像 "+saved.DisplayName+" image="+image)
	c.JSON(http.StatusOK, gin.H{"instance": saved})
}

func handleAppHermesRollback(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	if !requireAppCenterMutationConfirm(c, appCenterMutationConfirmed(c.Query("confirm")), "Hermes rollback") {
		return
	}
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	prev := normalizeHermesImage(inst.PreviousImage)
	if prev == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Hermes 实例没有可回滚镜像"})
		return
	}
	replicas := firstNonZeroInt32(inst.Replicas, 1)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := patchHermesDeploymentImage(ctx, app, *inst, prev, replicas); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	saved, err := patchHermesInstance(app.PlatformKV(), inst.ID, func(x *HermesInstance) {
		x.Image, x.PreviousImage = prev, x.Image
		x.Ready = false
		x.LastProbeError = "回滚后等待重新探测"
	})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, "应用中心 Hermes 回滚镜像 "+saved.DisplayName+" image="+prev)
	c.JSON(http.StatusOK, gin.H{"instance": saved})
}

func patchHermesDeploymentImage(ctx context.Context, app *ServerApp, inst HermesInstance, image string, replicas int32) error {
	if app.K8s() == nil {
		return apierrors.NewServiceUnavailable("K8s 未连接")
	}
	image = normalizeHermesImage(image)
	dep, err := app.K8s().AppsV1().Deployments(inst.Namespace).Get(ctx, inst.DeploymentName, metav1.GetOptions{})
	if err != nil {
		return err
	}
	for i := range dep.Spec.Template.Spec.Containers {
		dep.Spec.Template.Spec.Containers[i].Image = image
	}
	dep.Spec.Replicas = &replicas
	if dep.Spec.Template.Annotations == nil {
		dep.Spec.Template.Annotations = map[string]string{}
	}
	dep.Spec.Template.Annotations["easypanel/hermes-rollout-restarted-at"] = time.Now().UTC().Format(time.RFC3339)
	_, err = app.K8s().AppsV1().Deployments(inst.Namespace).Update(ctx, dep, metav1.UpdateOptions{})
	return err
}

func handleAppHermesLogs(c *gin.Context, app *ServerApp) {
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	tail := int64(300)
	if raw := strings.TrimSpace(c.Query("tail")); raw != "" {
		if n, err := strconv.ParseInt(raw, 10, 64); err == nil && n > 0 && n <= 2000 {
			tail = n
		}
	}
	containerFilter := strings.TrimSpace(c.Query("container"))
	previous := c.Query("previous") == "true"
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	pods, err := app.K8s().CoreV1().Pods(inst.Namespace).List(ctx, metav1.ListOptions{LabelSelector: "app.kubernetes.io/instance=" + inst.DeploymentName})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	logs := []gin.H{}
	for _, pod := range pods.Items {
		for _, container := range pod.Spec.Containers {
			if containerFilter != "" && container.Name != containerFilter {
				continue
			}
			raw, err := app.K8s().CoreV1().Pods(inst.Namespace).GetLogs(pod.Name, &corev1.PodLogOptions{
				Container: container.Name,
				TailLines: &tail,
				Previous:  previous,
			}).Do(ctx).Raw()
			row := gin.H{"pod": pod.Name, "container": container.Name, "log": string(raw), "ok": err == nil}
			if err != nil {
				row["error"] = err.Error()
			}
			logs = append(logs, row)
		}
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

func handleAppHermesEvents(c *gin.Context, app *ServerApp) {
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	evs, err := app.K8s().CoreV1().Events(inst.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	rows := []gin.H{}
	for _, ev := range evs.Items {
		name := ev.InvolvedObject.Name
		if name != inst.DeploymentName && name != inst.ServiceName && !strings.Contains(name, inst.DeploymentName) {
			continue
		}
		rows = append(rows, gin.H{
			"type":      ev.Type,
			"reason":    ev.Reason,
			"message":   ev.Message,
			"object":    ev.InvolvedObject.Kind + "/" + ev.InvolvedObject.Name,
			"firstTime": ev.FirstTimestamp,
			"lastTime":  ev.LastTimestamp,
			"count":     ev.Count,
		})
	}
	c.JSON(http.StatusOK, gin.H{"events": rows})
}

func firstNonZeroInt32(values ...int32) int32 {
	for _, v := range values {
		if v != 0 {
			return v
		}
	}
	return 0
}
