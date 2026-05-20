package service

import (
	"context"

	core "kube-bt-sync/internal"
)

func StartKubeSphereChartsCacheWatcher(app *ServerApp) {
	core.StartK8sKubeSphereChartsCacheWatcher(app)
}

func StartRestartCorrelationWorker(app *ServerApp) {
	core.StartK8sRestartCorrelationWorker(app)
}

func StartControlPlaneAdvisoryWorker(ctx context.Context, app *ServerApp) {
	core.StartK8sControlPlaneAdvisoryWorker(ctx, app)
}
