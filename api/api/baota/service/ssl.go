package service

import baotacore "kube-bt-sync/common/core"

type TargetEntry = baotacore.BaotaTargetEntry

func EffectiveTargets(cfg Config) []TargetEntry {
	return baotacore.EffectiveBaotaTargets(cfg)
}

func DeploySiteSSLPEM(cfg Config, siteName, certPEM, keyPEM string) error {
	return baotacore.DeployBaotaSiteSSLPEM(cfg, siteName, certPEM, keyPEM)
}
