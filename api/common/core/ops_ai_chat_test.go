package core

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
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

func TestOpsAIChatStreamPostStreamsProviderDeltas(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var sawStream bool
	var sawAuth bool
	var sawModel bool
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path = %q, want /v1/chat/completions", r.URL.Path)
		}
		if r.Header.Get("Authorization") == "Bearer test-key" {
			sawAuth = true
		}
		var payload struct {
			Model  string            `json:"model"`
			Stream bool              `json:"stream"`
			Msgs   []openClawChatMsg `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Errorf("decode upstream payload: %v", err)
		}
		sawStream = payload.Stream
		sawModel = payload.Model == "test-model"
		if len(payload.Msgs) < 2 || payload.Msgs[0].Role != "system" || payload.Msgs[len(payload.Msgs)-1].Content != "show pods" {
			t.Errorf("unexpected messages payload: %#v", payload.Msgs)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
	}))
	defer upstream.Close()

	cfg := Config{EncryptionKey: "test-encryption-key"}
	key, err := opsEncryptionKey(cfg)
	if err != nil {
		t.Fatalf("encryption key: %v", err)
	}
	apiKeyEnc, err := encryptSecret(key, "test-key")
	if err != nil {
		t.Fatalf("encrypt api key: %v", err)
	}
	kv := newTestPlatformKV()
	if err := saveOpsAIProviderBundle(kv, OpsAIProviderBundle{
		Endpoint: OpsAIProviderEndpoint{
			Enabled:   true,
			Provider:  OpsAIProviderKindCustom,
			Source:    OpsAIProviderSourceCustom,
			BaseURL:   upstream.URL + "/v1",
			APIKeyEnc: apiKeyEnc,
			Model:     "test-model",
		},
	}); err != nil {
		t.Fatalf("save provider bundle: %v", err)
	}
	app := &ServerApp{cfg: cfg, platformKV: kv}
	r := gin.New()
	r.POST("/api/ops/ai-chat/stream", handleOpsAIChatStreamPost(app))
	body := `{"messages":[{"role":"user","content":"show pods"}],"routePath":"/cluster","routeDescription":"Cluster","pageTitle":"Ops"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/ops/ai-chat/stream", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("content-type = %q, want text/event-stream", ct)
	}
	if !sawStream || !sawAuth || !sawModel {
		t.Fatalf("upstream flags stream=%v auth=%v model=%v", sawStream, sawAuth, sawModel)
	}
	raw := w.Body.String()
	for _, want := range []string{"event: meta", "event: delta", "\"delta\":\"hello\"", "\"delta\":\" world\"", "event: done"} {
		if !strings.Contains(raw, want) {
			t.Fatalf("stream body missing %q in %s", want, raw)
		}
	}
	for _, forbidden := range []string{"test-key", upstream.URL, "apiKey", "baseUrl", "instanceId"} {
		if strings.Contains(raw, forbidden) {
			t.Fatalf("stream body leaked %q in %s", forbidden, raw)
		}
	}
}
