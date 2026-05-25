package core

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestOpsAIChatStatusUnconfiguredIsSafe(t *testing.T) {
	app := &ServerApp{platformKV: newTestPlatformKV()}

	status := opsAIChatStatusPayload(app)

	if ready, _ := status["ready"].(bool); ready {
		t.Fatalf("ready = true, want false")
	}
	if enabled, _ := status["enabled"].(bool); enabled {
		t.Fatalf("enabled = true, want false")
	}
	if provider, _ := status["provider"].(string); provider != OpsAIProviderKindCustom {
		t.Fatalf("provider = %q, want custom", provider)
	}
	raw, _ := json.Marshal(status)
	for _, forbidden := range []string{"apiKey", "baseUrl", "instanceId", "secret"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("status leaked %q in %s", forbidden, raw)
		}
	}
}

func TestOpsAIChatStatusDoesNotExposeEndpointSecrets(t *testing.T) {
	kv := newTestPlatformKV()
	if err := saveOpsAIProviderBundle(kv, OpsAIProviderBundle{
		Endpoint: OpsAIProviderEndpoint{
			Enabled:   true,
			Provider:  OpsAIProviderKindCustom,
			Source:    OpsAIProviderSourceCustom,
			BaseURL:   "https://llm.example.test/v1",
			APIKeyEnc: "encrypted-secret",
			Model:     "ops-model",
		},
	}); err != nil {
		t.Fatalf("save bundle: %v", err)
	}
	app := &ServerApp{platformKV: kv}

	status := opsAIChatStatusPayload(app)

	if ready, _ := status["ready"].(bool); !ready {
		t.Fatalf("ready = false, want true: %#v", status)
	}
	if model, _ := status["model"].(string); model != "ops-model" {
		t.Fatalf("model = %q, want ops-model", model)
	}
	raw, _ := json.Marshal(status)
	for _, forbidden := range []string{"llm.example.test", "encrypted-secret", "apiKey", "baseUrl", "instanceId"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("status leaked %q in %s", forbidden, raw)
		}
	}
}

func TestValidateOpsAIChatMessages(t *testing.T) {
	valid := []opsAIChatMessage{
		{Role: "user", Content: "你好"},
		{Role: "assistant", Content: "你好，我在。"},
		{Role: "user", Content: "帮我看一下这个页面"},
	}
	if _, err := validateOpsAIChatMessages(valid); err != nil {
		t.Fatalf("valid messages returned error: %v", err)
	}

	cases := []struct {
		name     string
		messages []opsAIChatMessage
	}{
		{name: "empty", messages: nil},
		{name: "bad role", messages: []opsAIChatMessage{{Role: "system", Content: "x"}}},
		{name: "blank content", messages: []opsAIChatMessage{{Role: "user", Content: "  "}}},
		{name: "last assistant", messages: []opsAIChatMessage{{Role: "user", Content: "x"}, {Role: "assistant", Content: "y"}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := validateOpsAIChatMessages(tc.messages); err == nil {
				t.Fatalf("validateOpsAIChatMessages returned nil error")
			}
		})
	}

	tooMany := make([]opsAIChatMessage, 21)
	for i := range tooMany {
		tooMany[i] = opsAIChatMessage{Role: "user", Content: "x"}
	}
	if _, err := validateOpsAIChatMessages(tooMany); err == nil {
		t.Fatalf("too many messages returned nil error")
	}
}
