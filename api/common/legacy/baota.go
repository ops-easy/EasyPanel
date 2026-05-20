package legacy

import (
	"context"

	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"
)

type BaotaIngressSyncReport = core.BaotaIngressSyncReport
type BaotaTargetEntry = core.BaotaTargetEntry

func LoadBaotaIngressSyncReport(kv appctx.PlatformKV) (*BaotaIngressSyncReport, bool) {
	return core.LoadBaotaIngressSyncReport(kv)
}

func RunBaotaIngressSync(ctx context.Context, app *appctx.ServerApp, trigger string) *BaotaIngressSyncReport {
	return core.RunBaotaIngressSync(ctx, app, trigger)
}

func EffectiveBaotaTargets(cfg appctx.Config) []BaotaTargetEntry {
	return core.EffectiveBaotaTargets(cfg)
}

func DeployBaotaSiteSSLPEM(cfg appctx.Config, siteName, certPEM, keyPEM string) error {
	return core.DeployBaotaSiteSSLPEM(cfg, siteName, certPEM, keyPEM)
}
