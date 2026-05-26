package scheduler

import (
	"context"

	"github.com/ops-easy/EasyPanel/api/common/appctx"
	core "github.com/ops-easy/EasyPanel/api/common/core"
)

func StartSyncer(ctx context.Context, app *appctx.ServerApp) {
	core.StartSyncer(ctx, app)
}

func StartRedisReconnectLoop(ctx context.Context, app *appctx.ServerApp) {
	core.StartRedisReconnectLoop(ctx, app)
}
