package service

import core "kube-bt-sync/internal"

func StartBackground(app *ServerApp) {
	core.StartOpsCenterBackground(app)
}
