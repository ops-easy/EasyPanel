package provider

import (
	"github.com/ops-easy/EasyPanel/api/api/appcenter/model"
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	core "github.com/ops-easy/EasyPanel/api/common/core"
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
