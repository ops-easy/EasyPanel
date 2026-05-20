package scheduler

import (
	"context"

	appcentersvc "kube-bt-sync/api/appcenter/service"
	harborsvc "kube-bt-sync/api/harbor/service"
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"
)

func StartSettingsCrossPodRuntimeSync(ctx context.Context, getApp func() *appctx.ServerApp) {
	core.StartCrossPodRuntimeSync(ctx, getApp)
}

func StartSettingsRuntimeStatusRefresher(app *appctx.ServerApp) {
	core.StartRuntimeStatusRefresher(app)
}

func StartSystemHostEgressWatcher(app *appctx.ServerApp) {
	core.StartHostEgressWatcher(app)
}

func InitSystemLoginSecurityState(app *appctx.ServerApp) {
	core.InitLoginSecurityState(app)
}

func StartVCenterPrometheusMetricsRefresher(app *appctx.ServerApp) {
	core.StartVCenterPrometheusMetricsRefresher(app)
}

func BastionNativeSSHReconcileLoop(ctx context.Context, getApp func() *appctx.ServerApp) {
	core.BastionNativeSSHReconcileLoop(ctx, getApp)
}

func StartVCenterSessionKeepalive(getApp func() *appctx.ServerApp) {
	core.StartVCenterSessionKeepalive(getApp)
}

func StartVCenterEventWorker(app *appctx.ServerApp) {
	core.StartVCenterEventWorker(app)
}

func StartKubeSphereChartsCacheWatcher(app *appctx.ServerApp) {
	core.StartK8sKubeSphereChartsCacheWatcher(app)
}

func StartK8sRestartCorrelationWorker(app *appctx.ServerApp) {
	core.StartK8sRestartCorrelationWorker(app)
}

func StartK8sControlPlaneAdvisoryWorker(ctx context.Context, app *appctx.ServerApp) {
	core.StartK8sControlPlaneAdvisoryWorker(ctx, app)
}

func StartOpsBackground(app *appctx.ServerApp) {
	core.StartOpsCenterBackground(app)
}

func StartOpenClawGatewayHealthWatcher(app *appctx.ServerApp) {
	appcentersvc.StartOpenClawGatewayHealthWatcher(app)
}

func StartHarborImageIndexWorker(app *appctx.ServerApp) {
	harborsvc.StartHarborImageIndexWorker(app)
}
