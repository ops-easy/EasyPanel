package core

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const (
	opsAIChatMaxMessages          = 20
	opsAIChatMaxMessageRunes      = 8000
	opsAIChatMaxTotalContentRunes = 24000
	opsAIChatMaxContextRunes      = 400
)

type opsAIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type opsAIChatRequest struct {
	Messages         []opsAIChatMessage `json:"messages"`
	RoutePath        string             `json:"routePath"`
	RouteDescription string             `json:"routeDescription"`
	PageTitle        string             `json:"pageTitle"`
}

func opsAIChatStatusPayload(app *ServerApp) gin.H {
	out := gin.H{
		"ready":    false,
		"enabled":  false,
		"provider": OpsAIProviderKindCustom,
		"source":   OpsAIProviderSourceCustom,
		"model":    "",
		"message":  "AI Provider 尚未配置",
	}
	if app == nil || app.PlatformKV() == nil {
		out["message"] = "平台 KV 不可用，无法读取 AI Provider 配置"
		return out
	}
	bundle, err := loadOpsAIProviderBundle(app.PlatformKV())
	if err != nil {
		out["message"] = err.Error()
		return out
	}
	ep := bundle.Endpoint
	normalizeOpsAIProviderEndpoint(&ep)
	out["enabled"] = ep.Enabled
	out["provider"] = ep.Provider
	out["source"] = ep.Source
	out["model"] = ep.Model
	if !ep.Enabled {
		out["message"] = "AI Provider 未启用"
		return out
	}
	if !opsAIChatEndpointReady(ep) {
		out["message"] = "AI Provider 缺少 Base URL / API Key 或应用中心实例"
		return out
	}
	out["ready"] = true
	out["message"] = "AI Provider 已就绪"
	return out
}

func opsAIChatEndpointReady(ep OpsAIProviderEndpoint) bool {
	normalizeOpsAIProviderEndpoint(&ep)
	if !ep.Enabled {
		return false
	}
	if ep.Source == OpsAIProviderSourceAppCenter {
		return strings.TrimSpace(ep.InstanceID) != ""
	}
	return strings.TrimSpace(ep.BaseURL) != "" && strings.TrimSpace(ep.APIKeyEnc) != ""
}

func validateOpsAIChatMessages(messages []opsAIChatMessage) ([]openClawChatMsg, error) {
	if len(messages) == 0 {
		return nil, fmt.Errorf("消息不能为空")
	}
	if len(messages) > opsAIChatMaxMessages {
		return nil, fmt.Errorf("消息最多 %d 条", opsAIChatMaxMessages)
	}
	total := 0
	out := make([]openClawChatMsg, 0, len(messages))
	for i, m := range messages {
		role := strings.ToLower(strings.TrimSpace(m.Role))
		if role != "user" && role != "assistant" {
			return nil, fmt.Errorf("第 %d 条消息角色无效", i+1)
		}
		content := strings.TrimSpace(m.Content)
		if content == "" {
			return nil, fmt.Errorf("第 %d 条消息内容不能为空", i+1)
		}
		n := utf8.RuneCountInString(content)
		if n > opsAIChatMaxMessageRunes {
			return nil, fmt.Errorf("第 %d 条消息过长", i+1)
		}
		total += n
		if total > opsAIChatMaxTotalContentRunes {
			return nil, fmt.Errorf("消息总长度过长")
		}
		out = append(out, openClawChatMsg{Role: role, Content: content})
	}
	if out[len(out)-1].Role != "user" {
		return nil, fmt.Errorf("最后一条消息必须来自用户")
	}
	return out, nil
}

func opsAIChatContextLine(label, value string) string {
	v := strings.TrimSpace(value)
	if v == "" {
		return ""
	}
	if utf8.RuneCountInString(v) > opsAIChatMaxContextRunes {
		r := []rune(v)
		v = string(r[:opsAIChatMaxContextRunes]) + "..."
	}
	return fmt.Sprintf("- %s：%s\n", label, v)
}

func opsAIChatSystemPrompt(ep OpsAIProviderEndpoint, req opsAIChatRequest) string {
	var b strings.Builder
	b.WriteString("你是 EasyPanel 平台的全局运维助手。请优先围绕 Kubernetes、虚拟化、网络、应用中心、堡垒机、AI 巡检和文档中心等平台运维场景回答。")
	b.WriteString("回答保持准确、简洁、可执行；涉及命令或配置时说明风险，不编造平台中不存在的实时数据。\n")
	if custom := strings.TrimSpace(ep.SystemPrompt); custom != "" {
		b.WriteString("\n已配置的系统提示：\n")
		b.WriteString(custom)
		b.WriteString("\n")
	}
	ctx := opsAIChatContextLine("当前页面路径", req.RoutePath) +
		opsAIChatContextLine("当前页面说明", req.RouteDescription) +
		opsAIChatContextLine("浏览器标题", req.PageTitle)
	if strings.TrimSpace(ctx) != "" {
		b.WriteString("\n当前页面上下文：\n")
		b.WriteString(ctx)
	}
	return strings.TrimSpace(b.String())
}

func handleOpsAIChatStatusGet(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, opsAIChatStatusPayload(app))
	}
}

func handleOpsAIChatPost(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsAIChatRequest
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		msgs, err := validateOpsAIChatMessages(body.Messages)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		bundle, err := loadOpsAIProviderBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if !opsAIChatEndpointReady(bundle.Endpoint) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "AI Provider 未启用或尚未配置完整"})
			return
		}
		if err := ResolveOpsAIProviderEndpoint(app, app.Cfg(), &bundle); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		systemPrompt := opsAIChatSystemPrompt(bundle.Endpoint, body)
		providerMessages := make([]openClawChatMsg, 0, len(msgs)+1)
		providerMessages = append(providerMessages, openClawChatMsg{Role: "system", Content: systemPrompt})
		providerMessages = append(providerMessages, msgs...)
		timeout := bundle.Endpoint.TimeoutSec
		if timeout <= 0 {
			timeout = 120
		}
		content, latencyMs, err := opsAIProviderChatMessagesAPI(app.Cfg(), app, bundle.Endpoint, bundle.AI, providerMessages, timeout, 0)
		if err != nil {
			short, detail := opsAIProviderFailureDiagnosis(app, bundle, err, timeout)
			c.JSON(http.StatusBadRequest, gin.H{"error": short, "detail": detail})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":   content,
			"provider":  bundle.Endpoint.Provider,
			"source":    bundle.Endpoint.Source,
			"model":     bundle.Endpoint.Model,
			"latencyMs": latencyMs,
		})
	}
}

func handleOpsAIChatStreamPost(app *ServerApp) gin.HandlerFunc {
	return func(c *gin.Context) {
		var body opsAIChatRequest
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "参数无效"})
			return
		}
		msgs, err := validateOpsAIChatMessages(body.Messages)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		bundle, err := loadOpsAIProviderBundle(app.PlatformKV())
		if err != nil {
			RespondAPIError500(c, err.Error())
			return
		}
		if !opsAIChatEndpointReady(bundle.Endpoint) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "AI Provider 未启用或尚未配置完整"})
			return
		}
		if err := ResolveOpsAIProviderEndpoint(app, app.Cfg(), &bundle); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		systemPrompt := opsAIChatSystemPrompt(bundle.Endpoint, body)
		providerMessages := make([]openClawChatMsg, 0, len(msgs)+1)
		providerMessages = append(providerMessages, openClawChatMsg{Role: "system", Content: systemPrompt})
		providerMessages = append(providerMessages, msgs...)
		timeout := bundle.Endpoint.TimeoutSec
		if timeout <= 0 {
			timeout = 120
		}

		c.Header("Content-Type", "text/event-stream; charset=utf-8")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("X-Accel-Buffering", "no")
		c.Status(http.StatusOK)
		if err := writeOpsAIChatSSE(c, "meta", gin.H{
			"provider": bundle.Endpoint.Provider,
			"source":   bundle.Endpoint.Source,
			"model":    bundle.Endpoint.Model,
		}); err != nil {
			return
		}
		latencyMs, err := opsAIProviderChatMessagesStreamAPI(c.Request.Context(), app.Cfg(), bundle.Endpoint, bundle.AI, providerMessages, timeout, 0, func(delta string) error {
			return writeOpsAIChatSSE(c, "delta", gin.H{"delta": delta})
		})
		if err != nil {
			short, detail := opsAIProviderFailureDiagnosis(app, bundle, err, timeout)
			_ = writeOpsAIChatSSE(c, "error", gin.H{"error": short, "detail": detail})
			return
		}
		_ = writeOpsAIChatSSE(c, "done", gin.H{"latencyMs": latencyMs})
	}
}

func writeOpsAIChatSSE(c *gin.Context, event string, payload gin.H) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "event: %s\n", event); err != nil {
		return err
	}
	if _, err := fmt.Fprintf(c.Writer, "data: %s\n\n", raw); err != nil {
		return err
	}
	c.Writer.Flush()
	return nil
}
