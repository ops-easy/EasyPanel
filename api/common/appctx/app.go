package appctx

import core "kube-bt-sync/internal"

type ServerApp = core.ServerApp
type Config = core.Config
type PlatformKV = core.PlatformKV

func DataDirFromEnv() string {
	return core.DataDirFromEnv()
}

func NewServerApp(dataDir string) (*ServerApp, error) {
	return core.NewServerApp(dataDir)
}
