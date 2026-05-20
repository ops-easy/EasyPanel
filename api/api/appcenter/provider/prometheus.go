package provider

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/common/core"
)

func GetPrometheusURLForScope(cfg appctx.Config, scope string) string {
	return core.GetPrometheusURLForScope(cfg, scope)
}

func PrometheusPromQLInstantScalar(cfg appctx.Config, scope, promQL string) *float64 {
	return core.PrometheusPromQLInstantScalar(cfg, scope, promQL)
}
