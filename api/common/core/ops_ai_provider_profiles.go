package core

import "strings"

const (
	OpsAIProviderRoleInspectSummary  = "inspect_summary"
	OpsAIProviderRoleInspectProbe    = "inspect_probe"
	OpsAIProviderRoleVmLogAnalyze    = "vmlog_analyze"
	OpsAIProviderRoleClusterAdvisory = "cluster_advisory"
)

func aiProviderProfileIsActive(p OpsAIProviderEndpoint) bool {
	normalizeOpsAIProviderEndpoint(&p)
	if p.Source == OpsAIProviderSourceAppCenter && strings.TrimSpace(p.InstanceID) != "" {
		return true
	}
	return strings.TrimSpace(p.BaseURL) != ""
}

func effectiveAIProviderForRole(bundle OpsAIProviderBundle, role string) OpsAIProviderEndpoint {
	if bundle.ProviderProfiles == nil {
		return bundle.Endpoint
	}
	p, ok := bundle.ProviderProfiles[role]
	if !ok || !aiProviderProfileIsActive(p) {
		return bundle.Endpoint
	}
	return p
}

func aiProviderEnabledForRole(bundle OpsAIProviderBundle, role string) bool {
	if bundle.ProviderProfiles != nil {
		if p, ok := bundle.ProviderProfiles[role]; ok && aiProviderProfileIsActive(p) {
			return p.Enabled
		}
	}
	return bundle.Endpoint.Enabled
}

func opsAIProviderBundleForLLMRole(app *ServerApp, cfg Config, bundle OpsAIProviderBundle, role string) (OpsAIProviderBundle, error) {
	out := bundle
	out.Endpoint = effectiveAIProviderForRole(bundle, role)
	if err := ResolveOpsAIProviderEndpoint(app, cfg, &out); err != nil {
		return out, err
	}
	return out, nil
}
