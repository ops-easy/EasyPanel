package service

import core "kube-bt-sync/internal"

func StartHostEgressWatcher(app *ServerApp) {
	core.StartHostEgressWatcher(app)
}

func InitLoginSecurityState(app *ServerApp) {
	core.InitLoginSecurityState(app)
}
