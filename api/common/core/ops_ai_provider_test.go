package core

import (
	"encoding/json"
	"testing"
)

type testPlatformKV struct {
	data map[string]string
}

func newTestPlatformKV() *testPlatformKV {
	return &testPlatformKV{data: map[string]string{}}
}

func (kv *testPlatformKV) Get(k string) (string, bool) {
	v, ok := kv.data[k]
	return v, ok
}

func (kv *testPlatformKV) Set(k, v string) error {
	kv.data[k] = v
	return nil
}

func (kv *testPlatformKV) Snapshot() map[string]string {
	out := make(map[string]string, len(kv.data))
	for k, v := range kv.data {
		out[k] = v
	}
	return out
}

func TestLoadOpsAIProviderBundleDefaultsToCustomEndpoint(t *testing.T) {
	b, err := loadOpsAIProviderBundle(newTestPlatformKV())
	if err != nil {
		t.Fatalf("loadOpsAIProviderBundle returned error: %v", err)
	}
	if b.Endpoint.Provider != OpsAIProviderKindCustom {
		t.Fatalf("provider=%q, want %q", b.Endpoint.Provider, OpsAIProviderKindCustom)
	}
	if b.Endpoint.Source != OpsAIProviderSourceCustom {
		t.Fatalf("source=%q, want %q", b.Endpoint.Source, OpsAIProviderSourceCustom)
	}
	if b.Endpoint.TimeoutSec != 120 {
		t.Fatalf("timeout=%d, want 120", b.Endpoint.TimeoutSec)
	}
}

func TestSaveOpsAIProviderBundleWritesNewKVOnly(t *testing.T) {
	kv := newTestPlatformKV()
	err := saveOpsAIProviderBundle(kv, OpsAIProviderBundle{
		Endpoint: OpsAIProviderEndpoint{
			Enabled:    true,
			Provider:   OpsAIProviderKindHermes,
			Source:     OpsAIProviderSourceAppCenter,
			InstanceID: "hermes-1",
		},
	})
	if err != nil {
		t.Fatalf("saveOpsAIProviderBundle returned error: %v", err)
	}
	if _, ok := kv.Get("kubebt_ops_openclaw_v1"); ok {
		t.Fatalf("old OpenClaw KV key should not be written")
	}
	raw, ok := kv.Get(kvKeyOpsAIProvider)
	if !ok {
		t.Fatalf("new AI provider KV key was not written")
	}
	var payload OpsAIProviderBundle
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		t.Fatalf("stored json invalid: %v", err)
	}
	if payload.Endpoint.Provider != OpsAIProviderKindHermes {
		t.Fatalf("stored provider=%q, want hermes", payload.Endpoint.Provider)
	}
}

func TestEffectiveAIProviderForRoleFallsBackToGlobal(t *testing.T) {
	b := OpsAIProviderBundle{
		Endpoint: OpsAIProviderEndpoint{
			Enabled:    true,
			Provider:   OpsAIProviderKindOpenClaw,
			Source:     OpsAIProviderSourceAppCenter,
			InstanceID: "openclaw-1",
		},
		ProviderProfiles: map[string]OpsAIProviderEndpoint{
			OpsAIProviderRoleVmLogAnalyze: {
				Enabled:  true,
				Provider: OpsAIProviderKindHermes,
				Source:   OpsAIProviderSourceAppCenter,
			},
		},
	}
	got := effectiveAIProviderForRole(b, OpsAIProviderRoleVmLogAnalyze)
	if got.Provider != OpsAIProviderKindOpenClaw {
		t.Fatalf("inactive profile provider=%q, want global openclaw", got.Provider)
	}
}

func TestEffectiveAIProviderForRoleUsesActiveProfile(t *testing.T) {
	b := OpsAIProviderBundle{
		Endpoint: OpsAIProviderEndpoint{
			Enabled:    true,
			Provider:   OpsAIProviderKindOpenClaw,
			Source:     OpsAIProviderSourceAppCenter,
			InstanceID: "openclaw-1",
		},
		ProviderProfiles: map[string]OpsAIProviderEndpoint{
			OpsAIProviderRoleVmLogAnalyze: {
				Enabled:    true,
				Provider:   OpsAIProviderKindHermes,
				Source:     OpsAIProviderSourceAppCenter,
				InstanceID: "hermes-1",
			},
		},
	}
	got := effectiveAIProviderForRole(b, OpsAIProviderRoleVmLogAnalyze)
	if got.Provider != OpsAIProviderKindHermes || got.InstanceID != "hermes-1" {
		t.Fatalf("provider=(%q,%q), want hermes/hermes-1", got.Provider, got.InstanceID)
	}
}

func TestNormalizeOpsAIProviderEndpointForcesCustomSource(t *testing.T) {
	ep := OpsAIProviderEndpoint{
		Provider:   OpsAIProviderKindCustom,
		Source:     OpsAIProviderSourceAppCenter,
		InstanceID: "ignored",
		TimeoutSec: -1,
	}
	normalizeOpsAIProviderEndpoint(&ep)
	if ep.Source != OpsAIProviderSourceCustom {
		t.Fatalf("source=%q, want custom", ep.Source)
	}
	if ep.InstanceID != "" {
		t.Fatalf("instanceId=%q, want empty", ep.InstanceID)
	}
	if ep.TimeoutSec != 120 {
		t.Fatalf("timeout=%d, want 120", ep.TimeoutSec)
	}
}

func TestHermesGatewayBaseURL(t *testing.T) {
	got := appHermesGatewayBaseURL(&AppHermesInstance{
		Namespace:   "hermes",
		ServiceName: "hermes-agent",
	})
	want := "http://hermes-agent.hermes.svc.cluster.local:8642/v1"
	if got != want {
		t.Fatalf("baseURL=%q, want %q", got, want)
	}
}
