package service

import "kube-bt-sync/common/legacy"

type TargetEntry = legacy.BaotaTargetEntry

func EffectiveTargets(cfg Config) []TargetEntry {
	return legacy.EffectiveBaotaTargets(cfg)
}

func DeploySiteSSLPEM(cfg Config, siteName, certPEM, keyPEM string) error {
	return legacy.DeployBaotaSiteSSLPEM(cfg, siteName, certPEM, keyPEM)
}
