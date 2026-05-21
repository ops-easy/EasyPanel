package provider

import (
	"kube-bt-sync/api/appcenter/model"
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"
)

func OpsEncryptionKey(cfg appctx.Config) ([]byte, error) {
	return core.OpsEncryptionKey(cfg)
}

func LoadOpsAIProviderBundle(kv appctx.PlatformKV) (model.OpsAIProviderBundle, error) {
	return core.LoadOpsAIProviderBundle(kv)
}

func SaveOpsAIProviderBundle(kv appctx.PlatformKV, b model.OpsAIProviderBundle) error {
	return core.SaveOpsAIProviderBundle(kv, b)
}
