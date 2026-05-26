package core

import (
	"context"
	"time"
)

func mirrorPlatformKVIfDualWrite(app *ServerApp) {
	MirrorPlatformKVIfDualWrite(app)
}

func MirrorPlatformKVIfDualWrite(app *ServerApp) {
	cfg := app.Cfg()
	if !cfg.RuntimeDualWriteRedis {
		return
	}
	kv := app.PlatformKV()
	rdb := app.Redis()
	if kv == nil || rdb == nil {
		return
	}
	mctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	_ = MirrorPlatformKVToRedis(mctx, rdb, cfg, kv.Snapshot())
}
