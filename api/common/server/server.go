package server

import (
	"context"

	"kube-bt-sync/common/appctx"
	"kube-bt-sync/internal/transport/httpapi"
)

func Start(ctx context.Context, app *appctx.ServerApp) {
	httpapi.StartServer(ctx, app)
}
