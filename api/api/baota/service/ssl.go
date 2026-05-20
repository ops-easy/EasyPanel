package service

import core "kube-bt-sync/internal"

type TargetEntry = core.BaotaTargetEntry

func EffectiveTargets(cfg Config) []TargetEntry {
	return core.EffectiveBaotaTargets(cfg)
}

func DeploySiteSSLPEM(cfg Config, siteName, certPEM, keyPEM string) error {
	return core.DeployBaotaSiteSSLPEM(cfg, siteName, certPEM, keyPEM)
}
