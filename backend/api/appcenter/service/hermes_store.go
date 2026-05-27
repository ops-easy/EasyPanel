package service

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/google/uuid"
)

const (
	kvKeyHermesBootstrap = "appcenter_hermes_bootstrap_v1"
	kvKeyHermesInstances = "easypanel_app_hermes_instances_v1"
)

type HermesModePreset struct {
	ID          string   `json:"id"`
	Label       string   `json:"label"`
	Description string   `json:"description,omitempty"`
	Command     []string `json:"command,omitempty"`
}

type HermesBootstrap struct {
	BootstrapComplete  bool               `json:"bootstrapComplete"`
	DefaultNamespace   string             `json:"defaultNamespace"`
	DefaultMode        string             `json:"defaultMode"`
	DefaultImage       string             `json:"defaultImage"`
	DefaultStorageSize string             `json:"defaultStorageSize"`
	DefaultProvider    string             `json:"defaultModelProvider"`
	DefaultModelName   string             `json:"defaultModelName"`
	Modes              []HermesModePreset `json:"modes"`
}

type HermesInstance struct {
	ID             string `json:"id"`
	DisplayName    string `json:"displayName"`
	Namespace      string `json:"namespace"`
	DeploymentName string `json:"deploymentName"`
	ServiceName    string `json:"serviceName"`
	Image          string `json:"image"`
	Mode           string `json:"mode"`
	ModelProvider  string `json:"modelProvider,omitempty"`
	ModelName      string `json:"modelName,omitempty"`
	HomePVCName    string `json:"homePvcName"`
	SecretName     string `json:"secretName"`
	ConfigMapName  string `json:"configMapName"`
	ExposeMode     string `json:"exposeMode,omitempty"`
	IngressHost    string `json:"ingressHost,omitempty"`
	IngressName    string `json:"ingressName,omitempty"`
	PublicURL      string `json:"publicUrl,omitempty"`
	NodePort       int32  `json:"nodePort,omitempty"`
	Replicas       int32  `json:"replicas,omitempty"`
	PreviousImage  string `json:"previousImage,omitempty"`
	Ready          bool   `json:"ready"`
	LastProbeAt    string `json:"lastProbeAt,omitempty"`
	LastProbeError string `json:"lastProbeError,omitempty"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

type hermesInstancesPayload struct {
	Instances []HermesInstance `json:"instances"`
}

func normalizeHermesMode(mode string) (string, error) {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "" {
		m = "gateway-dashboard"
	}
	switch m {
	case "gateway", "dashboard", "gateway-dashboard":
		return m, nil
	default:
		return "", errors.New("mode 必须为 gateway、dashboard 或 gateway-dashboard")
	}
}

func defaultHermesBootstrap() *HermesBootstrap {
	return &HermesBootstrap{
		BootstrapComplete:  false,
		DefaultNamespace:   "hermes",
		DefaultMode:        "gateway-dashboard",
		DefaultImage:       hermesDefaultImage,
		DefaultStorageSize: "10Gi",
		DefaultProvider:    "openrouter",
		DefaultModelName:   "anthropic/claude-sonnet-4.5",
		Modes: []HermesModePreset{
			{ID: "gateway", Label: "Gateway", Description: "运行 hermes gateway run", Command: []string{"gateway", "run"}},
			{ID: "dashboard", Label: "Dashboard", Description: "运行 hermes dashboard", Command: []string{"dashboard", "--host", "0.0.0.0", "--no-open", "--insecure"}},
			{ID: "gateway-dashboard", Label: "Gateway + Dashboard", Description: "同时运行 gateway 与 dashboard"},
		},
	}
}

func loadHermesBootstrap(kv PlatformKV) *HermesBootstrap {
	def := defaultHermesBootstrap()
	if kv == nil {
		return def
	}
	raw, ok := kv.Get(kvKeyHermesBootstrap)
	if !ok || strings.TrimSpace(raw) == "" {
		return def
	}
	var b HermesBootstrap
	if err := json.Unmarshal([]byte(raw), &b); err != nil {
		return def
	}
	if b.DefaultNamespace == "" {
		b.DefaultNamespace = def.DefaultNamespace
	}
	if b.DefaultMode == "" {
		b.DefaultMode = def.DefaultMode
	}
	if b.DefaultImage == "" {
		b.DefaultImage = def.DefaultImage
	}
	if b.DefaultStorageSize == "" {
		b.DefaultStorageSize = def.DefaultStorageSize
	}
	if len(b.Modes) == 0 {
		b.Modes = def.Modes
	}
	return &b
}

func saveHermesBootstrap(kv PlatformKV, b *HermesBootstrap) error {
	if kv == nil || b == nil {
		return errors.New("platform_kv 不可用")
	}
	raw, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return kv.Set(kvKeyHermesBootstrap, string(raw))
}

func loadHermesInstances(kv PlatformKV) ([]HermesInstance, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyHermesInstances)
	if !ok || strings.TrimSpace(raw) == "" {
		return []HermesInstance{}, nil
	}
	var p hermesInstancesPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Instances == nil {
		return []HermesInstance{}, nil
	}
	return p.Instances, nil
}

func saveHermesInstances(kv PlatformKV, list []HermesInstance) error {
	if kv == nil {
		return errors.New("platform_kv 不可用")
	}
	raw, err := json.Marshal(hermesInstancesPayload{Instances: list})
	if err != nil {
		return err
	}
	return kv.Set(kvKeyHermesInstances, string(raw))
}

func appendHermesInstance(kv PlatformKV, inst HermesInstance) (HermesInstance, error) {
	list, err := loadHermesInstances(kv)
	if err != nil {
		return inst, err
	}
	if strings.TrimSpace(inst.ID) == "" {
		inst.ID = uuid.NewString()
	}
	if inst.Replicas == 0 {
		inst.Replicas = 1
	}
	list = append([]HermesInstance{inst}, list...)
	return inst, saveHermesInstances(kv, list)
}

func patchHermesInstance(kv PlatformKV, id string, patch func(*HermesInstance)) (HermesInstance, error) {
	list, err := loadHermesInstances(kv)
	if err != nil {
		return HermesInstance{}, err
	}
	for i := range list {
		if list[i].ID == strings.TrimSpace(id) {
			patch(&list[i])
			list[i].UpdatedAt = NowBeijingRFC3339()
			return list[i], saveHermesInstances(kv, list)
		}
	}
	return HermesInstance{}, errors.New("Hermes 实例不存在")
}

func findHermesInstance(list []HermesInstance, id string) *HermesInstance {
	id = strings.TrimSpace(id)
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}
