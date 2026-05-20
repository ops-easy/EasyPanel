package service

import (
	"context"

	core "kube-bt-sync/internal"
)

func StartPrometheusMetricsRefresher(app *ServerApp) {
	core.StartVCenterPrometheusMetricsRefresher(app)
}

func BastionNativeSSHReconcileLoop(ctx context.Context, getApp func() *ServerApp) {
	core.BastionNativeSSHReconcileLoop(ctx, getApp)
}

func StartSessionKeepalive(getApp func() *ServerApp) {
	core.StartVCenterSessionKeepalive(getApp)
}

func StartEventWorker(app *ServerApp) {
	core.StartVCenterEventWorker(app)
}
