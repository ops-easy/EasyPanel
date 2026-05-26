package provider

import (
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	core "github.com/ops-easy/EasyPanel/api/common/core"
)

func GetPrometheusURLForScope(cfg appctx.Config, scope string) string {
	return core.GetPrometheusURLForScope(cfg, scope)
}

func PrometheusPromQLInstantScalar(cfg appctx.Config, scope, promQL string) *float64 {
	return core.PrometheusPromQLInstantScalar(cfg, scope, promQL)
}
