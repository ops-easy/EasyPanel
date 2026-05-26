package core

import (
	"context"
	"fmt"
	"strings"
	"time"
)

func ResolveOpsAIProviderEndpoint(app *ServerApp, cfg Config, b *OpsAIProviderBundle) error {
	if b == nil {
		return nil
	}
	normalizeOpsAIProviderBundle(b)
	ep := &b.Endpoint
	if ep.Source != OpsAIProviderSourceAppCenter {
		return nil
	}
	switch ep.Provider {
	case OpsAIProviderKindOpenClaw:
		return resolveOpsAIProviderOpenClaw(app, cfg, ep)
	case OpsAIProviderKindHermes:
		return resolveOpsAIProviderHermes(app, cfg, ep)
	default:
		return nil
	}
}

func resolveOpsAIProviderOpenClaw(app *ServerApp, cfg Config, ep *OpsAIProviderEndpoint) error {
	if app == nil || app.PlatformKV() == nil {
		return fmt.Errorf("platform_kv 不可用")
	}
	id := strings.TrimSpace(ep.InstanceID)
	if id == "" {
		return fmt.Errorf("未选择应用中心 OpenClaw 实例")
	}
	list, err := loadAppOpenClawInstances(app.PlatformKV())
	if err != nil {
		return err
	}
	inst := findAppOpenClawInstance(list, id)
	if inst == nil {
		return fmt.Errorf("OpenClaw 实例不存在")
	}
	key, err := opsEncryptionKey(cfg)
	if err != nil {
		return err
	}
	tok, err := decryptSecret(key, inst.GatewayTokenEnc)
	if err != nil || strings.TrimSpace(tok) == "" {
		return fmt.Errorf("无法解密 OpenClaw 网关 Token，请重新同步应用中心实例")
	}
	ep.BaseURL = strings.TrimSpace(inst.ClusterV1BaseURL)
	if ep.BaseURL == "" {
		return fmt.Errorf("OpenClaw 实例缺少集群内 Base URL")
	}
	enc, err := encryptSecret(key, strings.TrimSpace(tok))
	if err != nil {
		return err
	}
	ep.APIKeyEnc = enc
	if strings.TrimSpace(ep.Model) == "" {
		ep.Model = MapOpenClawInstanceGatewayModelRef(inst)
	}
	return nil
}

func resolveOpsAIProviderHermes(app *ServerApp, cfg Config, ep *OpsAIProviderEndpoint) error {
	if app == nil || app.PlatformKV() == nil {
		return fmt.Errorf("platform_kv 不可用")
	}
	id := strings.TrimSpace(ep.InstanceID)
	if id == "" {
		return fmt.Errorf("未选择应用中心 Hermes 实例")
	}
	list, err := loadAppHermesInstances(app.PlatformKV())
	if err != nil {
		return err
	}
	inst := findAppHermesInstance(list, id)
	if inst == nil {
		return fmt.Errorf("Hermes 实例不存在")
	}
	if !appHermesGatewayModeReady(inst) {
		return fmt.Errorf("Hermes 实例未启用 gateway 模式，不能作为 AI 巡检模型端点")
	}
	if !inst.Ready {
		return fmt.Errorf("Hermes 实例尚未通过真实网关探测，不能作为 AI 巡检模型端点")
	}
	base := appHermesGatewayBaseURL(inst)
	if base == "" {
		return fmt.Errorf("Hermes 实例缺少 Service 或 Namespace")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	tok, err := readHermesGatewayToken(ctx, app.K8s(), inst)
	if err != nil {
		return err
	}
	key, err := opsEncryptionKey(cfg)
	if err != nil {
		return err
	}
	enc, err := encryptSecret(key, strings.TrimSpace(tok))
	if err != nil {
		return err
	}
	ep.BaseURL = base
	ep.APIKeyEnc = enc
	if strings.TrimSpace(ep.Model) == "" {
		ep.Model = strings.TrimSpace(inst.ModelName)
	}
	return nil
}
