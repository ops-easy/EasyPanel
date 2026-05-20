package service

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func RegisterHermesRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/app-center/hermes")
	g.GET("/bootstrap", func(c *gin.Context) { handleAppHermesBootstrapGet(c, app) })
	g.PUT("/bootstrap", func(c *gin.Context) { handleAppHermesBootstrapPut(c, app) })
	g.GET("/instances", func(c *gin.Context) { handleAppHermesList(c, app) })
	g.POST("/k8s-deploy", func(c *gin.Context) { handleAppHermesDeploy(c, app) })
	g.GET("/instances/k8s-status", func(c *gin.Context) { handleAppHermesK8sStatus(c, app) })
	g.GET("/instances/:id", func(c *gin.Context) { handleAppHermesGet(c, app) })
	g.GET("/instances/:id/file", func(c *gin.Context) { handleAppHermesFileGet(c, app) })
	g.PUT("/instances/:id/file", func(c *gin.Context) { handleAppHermesFilePut(c, app) })
	g.POST("/instances/:id/probe", func(c *gin.Context) { handleAppHermesProbe(c, app) })
	g.POST("/instances/:id/restart", func(c *gin.Context) { handleAppHermesRestart(c, app) })
	g.POST("/instances/:id/migrate-openclaw-dry-run", func(c *gin.Context) { handleAppHermesMigrateDryRun(c, app) })
	g.POST("/instances/:id/migrate-openclaw", func(c *gin.Context) { handleAppHermesMigrate(c, app) })
	g.DELETE("/instances/:id", func(c *gin.Context) { handleAppHermesDelete(c, app) })
}

func handleAppHermesList(c *gin.Context, app *ServerApp) {
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"instances": list})
}

type hermesDeployBody struct {
	DisplayName     string            `json:"displayName"`
	Namespace       string            `json:"namespace"`
	DeploymentName  string            `json:"deploymentName"`
	ServiceName     string            `json:"serviceName"`
	Image           string            `json:"image"`
	Mode            string            `json:"mode"`
	ModelProvider   string            `json:"modelProvider"`
	ModelName       string            `json:"modelName"`
	HomePVCName     string            `json:"homePvcName"`
	SecretName      string            `json:"secretName"`
	ConfigMapName   string            `json:"configMapName"`
	StorageSize     string            `json:"storageSize"`
	ExposeMode      string            `json:"exposeMode"`
	IngressHost     string            `json:"ingressHost"`
	PublicURL       string            `json:"publicUrl"`
	SecretPlaintext map[string]string `json:"secretPlaintext"`
}

func handleAppHermesDeploy(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	var body hermesDeployBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mode, err := normalizeHermesMode(body.Mode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	now := NowBeijingRFC3339()
	ns := strings.TrimSpace(body.Namespace)
	if ns == "" {
		ns = "hermes"
	}
	dep := strings.TrimSpace(body.DeploymentName)
	if dep == "" {
		dep = "hermes-agent"
	}
	img := strings.TrimSpace(body.Image)
	if img == "" {
		img = defaultHermesBootstrap().DefaultImage
	}
	pvc := strings.TrimSpace(body.HomePVCName)
	if pvc == "" {
		pvc = dep + "-home"
	}
	secret := strings.TrimSpace(body.SecretName)
	if secret == "" {
		secret = dep + "-secrets"
	}
	cm := strings.TrimSpace(body.ConfigMapName)
	if cm == "" {
		cm = dep + "-config"
	}
	if _, err := buildHermesDeployment(HermesK8sDeployOpts{
		Namespace:      ns,
		DeploymentName: dep,
		ServiceName:    body.ServiceName,
		Image:          img,
		Mode:           mode,
		PVCName:        pvc,
		SecretName:     secret,
		ConfigMapName:  cm,
		StorageSize:    body.StorageSize,
	}); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inst := HermesInstance{
		DisplayName:    strings.TrimSpace(body.DisplayName),
		Namespace:      ns,
		DeploymentName: dep,
		ServiceName:    firstNonEmptyHermes(body.ServiceName, dep),
		Image:          img,
		Mode:           mode,
		ModelProvider:  strings.TrimSpace(body.ModelProvider),
		ModelName:      strings.TrimSpace(body.ModelName),
		HomePVCName:    pvc,
		SecretName:     secret,
		ConfigMapName:  cm,
		ExposeMode:     strings.TrimSpace(body.ExposeMode),
		IngressHost:    strings.TrimSpace(body.IngressHost),
		PublicURL:      strings.TrimSpace(body.PublicURL),
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if inst.DisplayName == "" {
		inst.DisplayName = dep
	}
	k8sOpts := HermesK8sDeployOpts{
		Namespace:      ns,
		DeploymentName: dep,
		ServiceName:    inst.ServiceName,
		Image:          img,
		Mode:           mode,
		PVCName:        pvc,
		SecretName:     secret,
		ConfigMapName:  cm,
		StorageSize:    body.StorageSize,
	}
	secretPlain := map[string]string{}
	for k, v := range body.SecretPlaintext {
		if strings.TrimSpace(k) != "" {
			secretPlain[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	if (mode == "gateway" || mode == "gateway-dashboard") && strings.TrimSpace(secretPlain["API_SERVER_KEY"]) == "" {
		secretPlain["API_SERVER_KEY"] = randomGatewayToken()
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()
	if err := ensureNamespace(ctx, app.K8s(), ns); err != nil {
		RespondAPIError500(c, "Namespace: "+err.Error())
		return
	}
	if err := applyPVC(ctx, app.K8s(), buildHermesPVC(k8sOpts)); err != nil {
		RespondAPIError500(c, "PVC: "+err.Error())
		return
	}
	if err := applySecret(ctx, app.K8s(), buildHermesSecret(k8sOpts, secretPlain)); err != nil {
		RespondAPIError500(c, "Secret: "+err.Error())
		return
	}
	if err := applyConfigMap(ctx, app.K8s(), buildHermesConfigMap(k8sOpts, body.ModelProvider, body.ModelName)); err != nil {
		RespondAPIError500(c, "ConfigMap: "+err.Error())
		return
	}
	deployment, err := buildHermesDeployment(k8sOpts)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := upsertDeployment(ctx, app.K8s(), deployment); err != nil {
		RespondAPIError500(c, "Deployment: "+err.Error())
		return
	}
	if err := upsertService(ctx, app.K8s(), buildHermesService(k8sOpts)); err != nil {
		RespondAPIError500(c, "Service: "+err.Error())
		return
	}
	inst, err = appendHermesInstance(app.PlatformKV(), inst)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"instance": inst, "apiServerKey": secretPlain["API_SERVER_KEY"]})
}

func handleAppHermesK8sStatus(c *gin.Context, app *ServerApp) {
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	statuses := gin.H{}
	for _, x := range list {
		statuses[x.ID] = collectHermesK8sStatus(ctx, app, x)
	}
	c.JSON(http.StatusOK, gin.H{"statuses": statuses})
}

func handleAppHermesGet(c *gin.Context, app *ServerApp) {
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	inst := findHermesInstance(list, c.Param("id"))
	if inst == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hermes 实例不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"instance": inst})
}

func handleAppHermesProbe(c *gin.Context, app *ServerApp) {
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	inst := findHermesInstance(list, c.Param("id"))
	if inst == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hermes 实例不存在"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	st := collectHermesK8sStatus(ctx, app, *inst)
	ok, _ := st["ready"].(bool)
	msg := "Hermes 实例未就绪"
	if ok {
		msg = "Hermes Deployment 已就绪"
	}
	c.JSON(http.StatusOK, gin.H{"ok": ok, "mode": inst.Mode, "message": msg, "status": st})
}

func handleAppHermesRestart(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	if err := openClawRolloutRestartDeployment(ctx, app.K8s(), inst.Namespace, inst.DeploymentName); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "已触发 Hermes Deployment 滚动重启"})
}

func handleAppHermesMigrateDryRun(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"command": []string{"hermes", "claw", "migrate", "--dry-run"}, "dryRun": true})
}

func handleAppHermesMigrate(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"command": []string{"hermes", "claw", "migrate", "--preset", "user-data"}, "started": true})
}

func handleAppHermesDelete(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	out := make([]HermesInstance, 0, len(list))
	var deleted *HermesInstance
	for _, x := range list {
		if x.ID != id {
			out = append(out, x)
		} else {
			cp := x
			deleted = &cp
		}
	}
	if deleted != nil && app.K8s() != nil {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		deleteHermesK8sResources(ctx, app, *deleted)
	}
	if err := saveHermesInstances(app.PlatformKV(), out); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func loadHermesInstanceByParam(c *gin.Context, app *ServerApp) (*HermesInstance, bool) {
	list, err := loadHermesInstances(app.PlatformKV())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return nil, false
	}
	inst := findHermesInstance(list, c.Param("id"))
	if inst == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Hermes 实例不存在"})
		return nil, false
	}
	return inst, true
}

func collectHermesK8sStatus(ctx context.Context, app *ServerApp, inst HermesInstance) gin.H {
	out := gin.H{"k8sAvailable": app.K8s() != nil, "deploymentName": inst.DeploymentName, "ready": false}
	if app.K8s() == nil {
		out["message"] = "K8s 未连接"
		return out
	}
	dep, err := app.K8s().AppsV1().Deployments(inst.Namespace).Get(ctx, inst.DeploymentName, metav1.GetOptions{})
	if err != nil {
		out["deploymentFound"] = false
		out["message"] = "Deployment: " + err.Error()
		return out
	}
	out["deploymentFound"] = true
	out["readyReplicas"] = dep.Status.ReadyReplicas
	out["desiredReplicas"] = int32(1)
	if dep.Spec.Replicas != nil {
		out["desiredReplicas"] = *dep.Spec.Replicas
	}
	pods, err := app.K8s().CoreV1().Pods(inst.Namespace).List(ctx, metav1.ListOptions{LabelSelector: "app.kubernetes.io/instance=" + inst.DeploymentName})
	if err == nil && len(pods.Items) > 0 {
		p := pods.Items[0]
		out["podName"] = p.Name
		out["podPhase"] = string(p.Status.Phase)
		out["podReady"] = hermesPodReady(&p)
		out["containerStatuses"] = hermesContainerStatuses(&p)
	}
	if svc, err := app.K8s().CoreV1().Services(inst.Namespace).Get(ctx, inst.ServiceName, metav1.GetOptions{}); err == nil {
		out["serviceFound"] = true
		out["clusterIP"] = svc.Spec.ClusterIP
		ports := []gin.H{}
		for _, p := range svc.Spec.Ports {
			ports = append(ports, gin.H{"name": p.Name, "port": p.Port, "targetPort": p.TargetPort.String()})
		}
		out["ports"] = ports
	}
	ready := dep.Status.ReadyReplicas > 0
	out["ready"] = ready
	if ready {
		out["message"] = "Deployment 已就绪"
	} else {
		out["message"] = "等待 Deployment 就绪"
	}
	return out
}

func hermesPodReady(p *corev1.Pod) bool {
	if p == nil {
		return false
	}
	for _, cond := range p.Status.Conditions {
		if cond.Type == corev1.PodReady && cond.Status == corev1.ConditionTrue {
			return true
		}
	}
	return false
}

func hermesContainerStatuses(p *corev1.Pod) []gin.H {
	if p == nil {
		return nil
	}
	out := []gin.H{}
	for _, cs := range p.Status.ContainerStatuses {
		row := gin.H{"name": cs.Name, "ready": cs.Ready}
		switch {
		case cs.State.Waiting != nil:
			row["state"] = "waiting"
			row["reason"] = cs.State.Waiting.Reason
			row["message"] = cs.State.Waiting.Message
		case cs.State.Running != nil:
			row["state"] = "running"
		case cs.State.Terminated != nil:
			row["state"] = "terminated"
			row["reason"] = cs.State.Terminated.Reason
			row["message"] = cs.State.Terminated.Message
		default:
			row["state"] = "unknown"
		}
		out = append(out, row)
	}
	return out
}

func handleAppHermesFileGet(c *gin.Context, app *ServerApp) {
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	cm, err := app.K8s().CoreV1().ConfigMaps(inst.Namespace).Get(ctx, inst.ConfigMapName, metav1.GetOptions{})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"content": cm.Data["KUBEBT_HERMES_NOTES"], "config": cm.Data})
}

func handleAppHermesFilePut(c *gin.Context, app *ServerApp) {
	if getDashboardRoleFromGin(c) != DashboardRoleAdmin {
		RespondAPIPermissionDenied(c)
		return
	}
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	if app.K8s() == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "K8s 未连接"})
		return
	}
	var body struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()
	cm, err := app.K8s().CoreV1().ConfigMaps(inst.Namespace).Get(ctx, inst.ConfigMapName, metav1.GetOptions{})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if cm.Data == nil {
		cm.Data = map[string]string{}
	}
	cm.Data["KUBEBT_HERMES_NOTES"] = body.Content
	if _, err := app.K8s().CoreV1().ConfigMaps(inst.Namespace).Update(ctx, cm, metav1.UpdateOptions{}); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func deleteHermesK8sResources(ctx context.Context, app *ServerApp, inst HermesInstance) {
	k8s := app.K8s()
	ns := strings.TrimSpace(inst.Namespace)
	if k8s == nil || ns == "" {
		return
	}
	deleteOpts := metav1.DeleteOptions{}
	if strings.TrimSpace(inst.DeploymentName) != "" {
		err := k8s.AppsV1().Deployments(ns).Delete(ctx, inst.DeploymentName, deleteOpts)
		if err != nil && !apierrors.IsNotFound(err) {
			return
		}
	}
	if strings.TrimSpace(inst.ServiceName) != "" {
		_ = k8s.CoreV1().Services(ns).Delete(ctx, inst.ServiceName, deleteOpts)
	}
	if strings.TrimSpace(inst.HomePVCName) != "" {
		_ = k8s.CoreV1().PersistentVolumeClaims(ns).Delete(ctx, inst.HomePVCName, deleteOpts)
	}
	if strings.TrimSpace(inst.SecretName) != "" {
		_ = k8s.CoreV1().Secrets(ns).Delete(ctx, inst.SecretName, deleteOpts)
	}
	if strings.TrimSpace(inst.ConfigMapName) != "" {
		_ = k8s.CoreV1().ConfigMaps(ns).Delete(ctx, inst.ConfigMapName, deleteOpts)
	}
}

func firstNonEmptyHermes(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
