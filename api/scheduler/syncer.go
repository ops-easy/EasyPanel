package scheduler

import (
	"context"

	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"
)

func StartSyncer(ctx context.Context, app *appctx.ServerApp) {
	core.StartSyncer(ctx, app)
}

func StartRedisReconnectLoop(ctx context.Context, app *appctx.ServerApp) {
	core.StartRedisReconnectLoop(ctx, app)
}
