package service

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

type hermesExposureBody struct {
	ExposeMode  string `json:"exposeMode"`
	IngressHost string `json:"ingressHost"`
	PublicURL   string `json:"publicUrl"`
	NodePort    int32  `json:"nodePort"`
}

func normalizeHermesExposeMode(mode string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "clusterip", "cluster-ip":
		return "clusterIP", nil
	case "nodeport", "node-port":
		return "nodePort", nil
	case "loadbalancer", "load-balancer":
		return "loadBalancer", nil
	case "ingress":
		return "ingress", nil
	default:
		return "", errors.New("exposeMode 必须为 clusterIP、nodePort、loadBalancer 或 ingress")
	}
}

func buildHermesIngress(inst HermesInstance) *networkingv1.Ingress {
	name := strings.TrimSpace(inst.IngressName)
	if name == "" {
		name = strings.TrimSpace(inst.DeploymentName)
	}
	portName := "dashboard"
	if inst.Mode == "gateway" {
		portName = "gateway"
	}
	pathType := networkingv1.PathTypePrefix
	return &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{Name: name, Namespace: inst.Namespace, Labels: hermesLabels(inst.DeploymentName)},
		Spec: networkingv1.IngressSpec{
			Rules: []networkingv1.IngressRule{{
				Host: strings.TrimSpace(inst.IngressHost),
				IngressRuleValue: networkingv1.IngressRuleValue{
					HTTP: &networkingv1.HTTPIngressRuleValue{
						Paths: []networkingv1.HTTPIngressPath{{
							Path:     "/",
							PathType: &pathType,
							Backend: networkingv1.IngressBackend{Service: &networkingv1.IngressServiceBackend{
								Name: strings.TrimSpace(inst.ServiceName),
								Port: networkingv1.ServiceBackendPort{Name: portName},
							}},
						}},
					},
				},
			}},
		},
	}
}

func upsertHermesIngress(ctx context.Context, k8s *kubernetes.Clientset, ing *networkingv1.Ingress) error {
	if k8s == nil || ing == nil {
		return errors.New("K8s 未连接")
	}
	cli := k8s.NetworkingV1().Ingresses(ing.Namespace)
	ex, err := cli.Get(ctx, ing.Name, metav1.GetOptions{})
	if err == nil {
		ing.ResourceVersion = ex.ResourceVersion
		_, err = cli.Update(ctx, ing, metav1.UpdateOptions{})
		return err
	}
	if apierrors.IsNotFound(err) {
		_, err = cli.Create(ctx, ing, metav1.CreateOptions{})
		return err
	}
	return err
}

func handleAppHermesExposurePut(c *gin.Context, app *ServerApp) {
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
	var body hermesExposureBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	mode, err := normalizeHermesExposeMode(body.ExposeMode)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	next := *inst
	next.ExposeMode = mode
	next.IngressHost = strings.TrimSpace(body.IngressHost)
	next.PublicURL = strings.TrimSpace(body.PublicURL)
	next.NodePort = body.NodePort
	if next.IngressName == "" {
		next.IngressName = next.DeploymentName
	}
	if mode == "ingress" && next.IngressHost == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ingress 模式必须填写 ingressHost"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()
	opts := HermesK8sDeployOpts{
		Namespace:      next.Namespace,
		DeploymentName: next.DeploymentName,
		ServiceName:    next.ServiceName,
		Image:          next.Image,
		Mode:           next.Mode,
		PVCName:        next.HomePVCName,
		SecretName:     next.SecretName,
		ConfigMapName:  next.ConfigMapName,
		ExposeMode:     next.ExposeMode,
		NodePort:       next.NodePort,
		Replicas:       next.Replicas,
	}
	if err := upsertService(ctx, app.K8s(), buildHermesService(opts)); err != nil {
		RespondAPIError500(c, "Service: "+err.Error())
		return
	}
	if mode == "ingress" {
		if err := upsertHermesIngress(ctx, app.K8s(), buildHermesIngress(next)); err != nil {
			RespondAPIError500(c, "Ingress: "+err.Error())
			return
		}
	} else if strings.TrimSpace(next.IngressName) != "" {
		err := app.K8s().NetworkingV1().Ingresses(next.Namespace).Delete(ctx, next.IngressName, metav1.DeleteOptions{})
		if err != nil && !apierrors.IsNotFound(err) {
			RespondAPIError500(c, "Ingress delete: "+err.Error())
			return
		}
	}
	saved, err := patchHermesInstance(app.PlatformKV(), inst.ID, func(x *HermesInstance) {
		x.ExposeMode = next.ExposeMode
		x.IngressHost = next.IngressHost
		x.IngressName = next.IngressName
		x.PublicURL = next.PublicURL
		x.NodePort = next.NodePort
	})
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, gin.H{"instance": saved})
}

func hermesServiceTypeLabel(svc *corev1.Service) string {
	if svc == nil {
		return ""
	}
	return string(svc.Spec.Type)
}
