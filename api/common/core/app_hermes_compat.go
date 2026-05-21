package core

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const kvKeyAppHermesInstances = "kubebt_app_hermes_instances_v1"

type AppHermesInstance struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	Namespace      string `json:"namespace"`
	DeploymentName string `json:"deploymentName"`
	ServiceName    string `json:"serviceName"`
	Mode           string `json:"mode"`
	ModelProvider  string `json:"modelProvider,omitempty"`
	ModelName      string `json:"modelName,omitempty"`
	SecretName     string `json:"secretName"`
}

type appHermesInstancesPayload struct {
	Instances []AppHermesInstance `json:"instances"`
}

func loadAppHermesInstances(kv PlatformKV) ([]AppHermesInstance, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyAppHermesInstances)
	if !ok || strings.TrimSpace(raw) == "" {
		return []AppHermesInstance{}, nil
	}
	var p appHermesInstancesPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Instances == nil {
		return []AppHermesInstance{}, nil
	}
	return p.Instances, nil
}

func findAppHermesInstance(list []AppHermesInstance, id string) *AppHermesInstance {
	id = strings.TrimSpace(id)
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}

func appHermesGatewayBaseURL(inst *AppHermesInstance) string {
	if inst == nil {
		return ""
	}
	ns := strings.TrimSpace(inst.Namespace)
	svc := strings.TrimSpace(inst.ServiceName)
	if ns == "" || svc == "" {
		return ""
	}
	return fmt.Sprintf("http://%s.%s.svc.cluster.local:8642/v1", svc, ns)
}

func appHermesGatewayModeReady(inst *AppHermesInstance) bool {
	if inst == nil {
		return false
	}
	mode := strings.TrimSpace(inst.Mode)
	return mode == "gateway" || mode == "gateway-dashboard"
}

func readHermesGatewayToken(ctx context.Context, k8s *kubernetes.Clientset, inst *AppHermesInstance) (string, error) {
	if k8s == nil {
		return "", errors.New("K8s 未连接，无法读取 Hermes Secret")
	}
	if inst == nil {
		return "", errors.New("Hermes 实例为空")
	}
	name := strings.TrimSpace(inst.SecretName)
	if name == "" {
		name = strings.TrimSpace(inst.DeploymentName) + "-secrets"
	}
	sec, err := k8s.CoreV1().Secrets(strings.TrimSpace(inst.Namespace)).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", err
	}
	token := strings.TrimSpace(string(sec.Data["API_SERVER_KEY"]))
	if token == "" {
		return "", errors.New("Hermes Secret 缺少 API_SERVER_KEY")
	}
	return token, nil
}
