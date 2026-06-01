package service

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppCenterRuntimeMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	numberID := gin.Params{{Key: "id", Value: "1"}}
	stringID := gin.Params{{Key: "id", Value: "demo"}}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "redis delete template",
			method: http.MethodDelete,
			path:   "/api/app-center/redis/templates/1",
			params: numberID,
			run:    func(c *gin.Context) { handleAppRedisTemplateDelete(c, nil) },
		},
		{
			name:   "mysql delete template",
			method: http.MethodDelete,
			path:   "/api/app-center/mysql/templates/1",
			params: numberID,
			run:    func(c *gin.Context) { handleAppMySQLTemplateDelete(c, nil) },
		},
		{
			name:   "opensearch delete template",
			method: http.MethodDelete,
			path:   "/api/app-center/opensearch/templates/1",
			params: numberID,
			run:    func(c *gin.Context) { handleOpenSearchTemplateDelete(c, nil) },
		},
		{
			name:   "hermes write file",
			method: http.MethodPut,
			path:   "/api/app-center/hermes/instances/demo/file",
			body:   `{"content":"notes"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesFilePut(c, nil) },
		},
		{
			name:   "hermes restart",
			method: http.MethodPost,
			path:   "/api/app-center/hermes/instances/demo/restart",
			body:   `{}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesRestart(c, nil) },
		},
		{
			name:   "hermes upgrade",
			method: http.MethodPost,
			path:   "/api/app-center/hermes/instances/demo/upgrade",
			body:   `{"image":"repo/hermes:v2","replicas":1}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesUpgrade(c, nil) },
		},
		{
			name:   "hermes rollback",
			method: http.MethodPost,
			path:   "/api/app-center/hermes/instances/demo/rollback",
			body:   `{}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesRollback(c, nil) },
		},
		{
			name:   "hermes update exposure",
			method: http.MethodPut,
			path:   "/api/app-center/hermes/instances/demo/exposure",
			body:   `{"exposeMode":"ingress","ingressHost":"hermes.example.com"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesExposurePut(c, nil) },
		},
		{
			name:   "hermes migrate",
			method: http.MethodPost,
			path:   "/api/app-center/hermes/instances/demo/migrate-openclaw",
			body:   `{"preset":"user-data"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesMigrate(c, nil) },
		},
		{
			name:   "hermes delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/hermes/instances/demo",
			params: stringID,
			run:    func(c *gin.Context) { handleAppHermesDelete(c, nil) },
		},
		{
			name:   "openclaw write file",
			method: http.MethodPut,
			path:   "/api/app-center/openclaw/instances/demo/file",
			body:   `{"path":"openclaw.json","content":"{}"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawFilePut(c, nil) },
		},
		{
			name:   "openclaw set chat model",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/chat-model",
			body:   `{"chatModel":"gpt-4o"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawSetChatModel(c, nil) },
		},
		{
			name:   "openclaw apply upstream runtime",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/apply-upstream-runtime",
			body:   `{"chatModel":"gpt-4o","openaiBaseUrl":"https://api.example.com/v1"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawApplyUpstreamRuntime(c, nil) },
		},
		{
			name:   "openclaw telegram settings",
			method: http.MethodPut,
			path:   "/api/app-center/openclaw/instances/demo/telegram-settings",
			body:   `{"telegramEnabled":true,"telegramBotToken":"token"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleOpenClawTelegramSettingsPut(c, nil) },
		},
		{
			name:   "openclaw apply telegram json",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/apply-telegram-to-openclaw-json",
			body:   `{}`,
			params: stringID,
			run:    func(c *gin.Context) { handleOpenClawApplyTelegramToJSON(c, nil) },
		},
		{
			name:   "openclaw egress proxy",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/egress-proxy",
			body:   `{"httpProxyUrl":"http://proxy:8080"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawPatchEgressProxy(c, nil) },
		},
		{
			name:   "openclaw rbac preset",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/rbac-preset",
			body:   `{"preset":"readonly"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawInstanceRBACPreset(c, nil) },
		},
		{
			name:   "openclaw toolchain preset",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/apply-toolchain-preset",
			body:   `{"toolsProfile":"coding","promptPacks":[]}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawApplyToolchainPreset(c, nil) },
		},
		{
			name:   "openclaw gateway image",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/gateway-image",
			body:   `{"image":"repo/gateway:v2"}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawGatewayImage(c, nil) },
		},
		{
			name:   "openclaw sync inspect",
			method: http.MethodPost,
			path:   "/api/app-center/openclaw/instances/demo/sync-to-inspect",
			body:   `{}`,
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawSyncInspect(c, nil) },
		},
		{
			name:   "openclaw delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/openclaw/instances/demo",
			params: stringID,
			run:    func(c *gin.Context) { handleAppOpenClawDelete(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newAppCenterMutationTestContext(tc.method, tc.path, tc.body, tc.params)
			runAppCenterMutationHandler(t, func() { tc.run(c) })
			assertAppCenterMissingConfirm(t, w)
		})
	}
}
