package appctx

import core "github.com/ops-easy/EasyPanel/backend/common/core"

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV
type RedisLight = core.RedisLight

func DataDirFromEnv() string {
	return core.DataDirFromEnv()
}

func NewServerApp(dataDir string) (*ServerApp, error) {
	return core.NewServerApp(dataDir)
}

func MirrorPlatformKVIfDualWrite(app *ServerApp) {
	core.MirrorPlatformKVIfDualWrite(app)
}
