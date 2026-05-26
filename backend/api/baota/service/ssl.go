package service

import baotacore "github.com/ops-easy/EasyPanel/backend/common/core"

type TargetEntry = baotacore.BaotaTargetEntry

func EffectiveTargets(cfg Config) []TargetEntry {
	return baotacore.EffectiveBaotaTargets(cfg)
}

func DeploySiteSSLPEM(cfg Config, siteName, certPEM, keyPEM string) error {
	return baotacore.DeployBaotaSiteSSLPEM(cfg, siteName, certPEM, keyPEM)
}
