package provider

import (
	"kube-bt-sync/api/appcenter/model"
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"
)

func OpsEncryptionKey(cfg appctx.Config) ([]byte, error) {
	return core.OpsEncryptionKey(cfg)
}

func LoadOpsOpenClawBundle(kv appctx.PlatformKV) (model.OpsOpenClawBundle, error) {
	return core.LoadOpsOpenClawBundle(kv)
}

func SaveOpsOpenClawBundle(kv appctx.PlatformKV, b model.OpsOpenClawBundle) error {
	return core.SaveOpsOpenClawBundle(kv, b)
}
