package core

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	corev1 "k8s.io/api/core/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

const kvKeyAppOpenClawInstances = "kubebt_app_openclaw_instances_v1"

// AppOpenClawInstance is kept in the root package while Ops remains there.
type AppOpenClawInstance struct {
	ID                   string   `json:"id"`
	DisplayName          string   `json:"displayName"`
	Namespace            string   `json:"namespace"`
	DeploymentName       string   `json:"deploymentName"`
	ServiceName          string   `json:"serviceName"`
	Image                string   `json:"image"`
	GatewayPort          int      `json:"gatewayPort"`
	NodePort             int32    `json:"nodePort"`
	ModelPreset          string   `json:"modelPreset"`
	GatewayTokenEnc      string   `json:"gatewayTokenEnc"`
	ClusterV1BaseURL     string   `json:"clusterV1BaseURL"`
	ExternalV1URL        string   `json:"externalV1Url"`
	NodeAccessIP         string   `json:"nodeAccessIP,omitempty"`
	ExposeMode           string   `json:"exposeMode,omitempty"`
	IngressHost          string   `json:"ingressHost,omitempty"`
	IngressResourceName  string   `json:"ingressResourceName,omitempty"`
	PublicV1URL          string   `json:"publicV1Url,omitempty"`
	CreatedAt            string   `json:"createdAt"`
	PvcClaimName         string   `json:"pvcClaimName,omitempty"`
	SecretName           string   `json:"secretName,omitempty"`
	ConfigMapName        string   `json:"configMapName,omitempty"`
	ServiceAccountName   string   `json:"serviceAccountName,omitempty"`
	ChatModel            string   `json:"chatModel,omitempty"`
	ChatProxyCount       int64    `json:"chatProxyCount,omitempty"`
	ChatProxyCountViewer int64    `json:"chatProxyCountViewer,omitempty"`
	UpstreamCheckStatus  string   `json:"upstreamCheckStatus,omitempty"`
	UpstreamCheckMessage string   `json:"upstreamCheckMessage,omitempty"`
	UpstreamCheckAt      string   `json:"upstreamCheckAt,omitempty"`
	EgressCloudVmID      string   `json:"egressCloudVmId,omitempty"`
	HttpProxyURL         string   `json:"httpProxyUrl,omitempty"`
	RBACPreset           string   `json:"rbacPreset,omitempty"`
	ToolsProfile         string   `json:"toolsProfile,omitempty"`
	PromptPacks          []string `json:"promptPacks,omitempty"`
}

type appOpenClawInstancesPayload struct {
	Instances []AppOpenClawInstance `json:"instances"`
}

func loadAppOpenClawInstances(kv PlatformKV) ([]AppOpenClawInstance, error) {
	if kv == nil {
		return nil, errors.New("platform_kv 不可用")
	}
	raw, ok := kv.Get(kvKeyAppOpenClawInstances)
	if !ok || strings.TrimSpace(raw) == "" {
		return []AppOpenClawInstance{}, nil
	}
	var p appOpenClawInstancesPayload
	if err := json.Unmarshal([]byte(raw), &p); err != nil {
		return nil, err
	}
	if p.Instances == nil {
		return []AppOpenClawInstance{}, nil
	}
	return p.Instances, nil
}

func findAppOpenClawInstance(list []AppOpenClawInstance, id string) *AppOpenClawInstance {
	id = strings.TrimSpace(id)
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}

func ResolveOpsOpenClawEndpoint(app *ServerApp, cfg Config, b *OpsOpenClawBundle) error {
	if b == nil {
		return nil
	}
	src := strings.TrimSpace(b.OpenClaw.EndpointSource)
	if src != "appInstance" {
		return nil
	}
	id := strings.TrimSpace(b.OpenClaw.AppInstanceID)
	if id == "" {
		return fmt.Errorf("未选择应用中心 OpenClaw 实例")
	}
	list, err := loadAppOpenClawInstances(app.PlatformKV())
	if err != nil {
		return err
	}
	inst := findAppOpenClawInstance(list, id)
	if inst == nil {
		return fmt.Errorf("OpenClaw 实例不存在")
	}
	key, err := opsEncryptionKey(cfg)
	if err != nil {
		return err
	}
	tok, err := decryptSecret(key, inst.GatewayTokenEnc)
	if err != nil || strings.TrimSpace(tok) == "" {
		return fmt.Errorf("无法解密网关 Token，请重新同步应用中心实例")
	}
	b.OpenClaw.BaseURL = strings.TrimSpace(inst.ClusterV1BaseURL)
	if b.OpenClaw.BaseURL == "" {
		return fmt.Errorf("实例缺少集群内 Base URL")
	}
	enc, err := encryptSecret(key, strings.TrimSpace(tok))
	if err != nil {
		return err
	}
	b.OpenClaw.APIKeyEnc = enc
	if strings.TrimSpace(b.OpenClaw.Model) == "" {
		b.OpenClaw.Model = MapOpenClawInstanceGatewayModelRef(inst)
	}
	return nil
}

func MapOpenClawInstanceChatModel(inst *AppOpenClawInstance) string {
	if inst == nil {
		return ""
	}
	if m := strings.TrimSpace(inst.ChatModel); m != "" {
		return m
	}
	if m := mapModelPresetToAPI(inst.ModelPreset); strings.TrimSpace(m) != "" {
		return m
	}
	return defaultOpenClawFallbackChatModelID
}

func MapOpenClawInstanceGatewayModelRef(inst *AppOpenClawInstance) string {
	if inst == nil {
		return ""
	}
	return openClawGatewayModelRefForPreset(strings.TrimSpace(inst.ModelPreset), MapOpenClawInstanceChatModel(inst))
}

func mapModelPresetToAPI(preset string) string {
	switch strings.TrimSpace(preset) {
	case "glm-4.7":
		return "glm-4.7"
	case "minimax-m2.5":
		return "MiniMax-M2.5"
	case "minimax-m2.7":
		return "MiniMax-M2.7"
	case "openai":
		return "gpt-4o-mini"
	case "ollama":
		return "llama3.2"
	case "qwen-compatible":
		return "qwen-turbo"
	case "kimi":
		return "moonshot-v1-8k"
	default:
		return preset
	}
}

const defaultOpenClawFallbackChatModelID = "MiniMax-M2.7"

func openClawGatewayModelRefForPreset(preset, chatModel string) string {
	model := strings.TrimSpace(chatModel)
	if model == "" {
		model = mapModelPresetToAPI(preset)
	}
	if model == "" {
		return ""
	}
	switch strings.TrimSpace(preset) {
	case "minimax-m2.5", "minimax-m2.7":
		return "minimax/" + model
	case "glm-4.7":
		return "zhipu/" + model
	case "qwen-compatible":
		return "qwen/" + model
	case "kimi":
		return "kimi/" + model
	case "ollama":
		return "ollama/" + model
	case "custom":
		return "custom-openai/" + model
	case "openai":
		return "openai/" + model
	default:
		if strings.Contains(model, "/") {
			return model
		}
		return "openai/" + model
	}
}

func openClawOpenAIChatCompletionsURL(base string) string {
	bt := strings.TrimRight(strings.TrimSpace(base), "/")
	if bt == "" {
		return ""
	}
	if strings.HasSuffix(bt, "/v1") {
		return bt + "/chat/completions"
	}
	if strings.Contains(bt, "open.bigmodel.cn") {
		return bt + "/chat/completions"
	}
	return bt + "/v1/chat/completions"
}

func shouldUseOpenClawGatewayHTTPContract(baseURL string) bool {
	raw := strings.TrimSpace(baseURL)
	if raw == "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return false
	}
	host := strings.ToLower(u.Host)
	if !strings.Contains(host, ".svc.cluster.local") {
		return false
	}
	if strings.Contains(host, ":18789") {
		return true
	}
	return strings.Contains(strings.ToLower(u.Hostname()), "openclaw")
}

func openClawQualifyGatewayUpstreamModel(model string) string {
	m := strings.TrimSpace(model)
	if m == "" {
		return ""
	}
	if strings.Contains(m, "/") {
		return m
	}
	low := strings.ToLower(m)
	if strings.HasPrefix(low, "claude-") || strings.HasPrefix(low, "claude_") {
		return "anthropic/" + m
	}
	return "openai/" + m
}

type openClawGatewayRoutingCandidate struct {
	bodyModel   string
	headerModel string
}

func openClawGatewayRoutingCandidates(model string) []openClawGatewayRoutingCandidate {
	m := strings.TrimSpace(model)
	if m == "" {
		return []openClawGatewayRoutingCandidate{{bodyModel: "openclaw/default"}}
	}
	low := strings.ToLower(m)
	if low == "openclaw" || strings.HasPrefix(low, "openclaw/") || strings.HasPrefix(low, "openclaw:") {
		return []openClawGatewayRoutingCandidate{{bodyModel: m}}
	}
	seen := map[string]struct{}{}
	var out []openClawGatewayRoutingCandidate
	add := func(bodyModel, headerModel string) {
		key := bodyModel + "\x00" + headerModel
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}
		out = append(out, openClawGatewayRoutingCandidate{bodyModel: bodyModel, headerModel: headerModel})
	}
	qualified := openClawQualifyGatewayUpstreamModel(m)
	add("openclaw/default", qualified)
	if qualified != m {
		add("openclaw/default", m)
	}
	return out
}

func openClawApplyGatewayModelRouting(model string) (bodyModel string, xOpenclawModel string) {
	cands := openClawGatewayRoutingCandidates(model)
	if len(cands) == 0 {
		return "openclaw/default", ""
	}
	return cands[0].bodyModel, cands[0].headerModel
}

func opsUseOpenClawGatewayModelRouting(oc OpenClawConfig) bool {
	if strings.TrimSpace(oc.EndpointSource) == "appInstance" {
		return true
	}
	return shouldUseOpenClawGatewayHTTPContract(oc.BaseURL)
}

func openClawPickLatestPod(items []corev1.Pod) *corev1.Pod {
	if len(items) == 0 {
		return nil
	}
	best := 0
	for i := 1; i < len(items); i++ {
		if items[i].CreationTimestamp.After(items[best].CreationTimestamp.Time) {
			best = i
		}
	}
	return &items[best]
}

func openClawGatewayImageFromContainers(containers []corev1.Container) string {
	for _, c := range containers {
		if c.Name == "gateway" {
			return strings.TrimSpace(c.Image)
		}
	}
	return ""
}

func openClawAnnotateImageRollout(h gin.H, registeredImage, templateGW, runGW string) {
	if templateGW != "" {
		h["templateGatewayImage"] = templateGW
	}
	if runGW != "" {
		h["runningGatewayImage"] = runGW
	}
	reg := strings.TrimSpace(registeredImage)
	run := strings.TrimSpace(runGW)
	phase, _ := h["phase"].(string)
	podReady, _ := h["podReady"].(bool)
	if reg == "" {
		h["imageRolloutSynced"] = true
		return
	}
	synced := phase == "ready" && podReady && run == reg
	h["imageRolloutSynced"] = synced
	if synced {
		return
	}
	if run != "" && run != reg {
		h["imageRolloutMessage"] = "运行 Pod 镜像与平台登记不一致（切换中或未拉取完成），待就绪且一致后可对话。"
	} else if phase == "progress" || phase == "missing" || phase == "error" {
		h["imageRolloutMessage"] = "网关尚未就绪或 Deployment 异常，请待 Pod 运行且镜像与登记一致。"
	}
}

func openClawK8sStatus(ctx context.Context, k8s *kubernetes.Clientset, ns, depName, registeredImage string) gin.H {
	ns = strings.TrimSpace(ns)
	depName = strings.TrimSpace(depName)
	h := gin.H{
		"k8sAvailable": k8s != nil,
		"phase":        "no_k8s",
		"message":      "K8s 未连接",
	}
	if k8s == nil {
		openClawAnnotateImageRollout(h, registeredImage, "", "")
		return h
	}
	if ns == "" || depName == "" {
		h["phase"] = "error"
		h["message"] = "缺少命名空间或 Deployment 名"
		openClawAnnotateImageRollout(h, registeredImage, "", "")
		return h
	}
	dep, err := k8s.AppsV1().Deployments(ns).Get(ctx, depName, metav1.GetOptions{})
	if err != nil {
		if apierrors.IsNotFound(err) {
			h["phase"] = "missing"
			h["deploymentFound"] = false
			h["message"] = "集群中未找到该 Deployment"
			openClawAnnotateImageRollout(h, registeredImage, "", "")
			return h
		}
		h["phase"] = "error"
		h["message"] = err.Error()
		openClawAnnotateImageRollout(h, registeredImage, "", "")
		return h
	}
	templateGW := openClawGatewayImageFromContainers(dep.Spec.Template.Spec.Containers)
	h["deploymentFound"] = true
	des := int32(1)
	if dep.Spec.Replicas != nil {
		des = *dep.Spec.Replicas
	}
	rdy := dep.Status.ReadyReplicas
	h["readyReplicas"] = rdy
	h["desiredReplicas"] = des

	pods, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: "app=" + depName})
	if err != nil {
		h["phase"] = "error"
		h["message"] = "Pod 列表: " + err.Error()
		openClawAnnotateImageRollout(h, registeredImage, templateGW, "")
		return h
	}
	p := openClawPickLatestPod(pods.Items)
	if p == nil {
		h["phase"] = "progress"
		h["podPhase"] = ""
		h["message"] = fmt.Sprintf("Deployment %d/%d，尚无 Pod（调度或拉镜像中）", rdy, des)
		openClawAnnotateImageRollout(h, registeredImage, templateGW, "")
		return h
	}
	runGW := openClawGatewayImageFromContainers(p.Spec.Containers)
	podReady := false
	for _, c := range p.Status.Conditions {
		if c.Type == corev1.PodReady && c.Status == corev1.ConditionTrue {
			podReady = true
			break
		}
	}
	ph := string(p.Status.Phase)
	h["podName"] = p.Name
	h["podPhase"] = ph
	h["podReady"] = podReady

	if rdy >= 1 && ph == string(corev1.PodRunning) && podReady {
		h["phase"] = "ready"
		h["message"] = "运行中（Deployment 与 Pod 就绪）"
		openClawAnnotateImageRollout(h, registeredImage, templateGW, runGW)
		return h
	}
	h["phase"] = "progress"
	h["message"] = fmt.Sprintf("Deployment %d/%d · Pod %s（%s）", rdy, des, p.Name, ph)
	if ph == string(corev1.PodPending) {
		h["message"] = fmt.Sprintf("Pod 调度/拉镜像中（%s）", p.Name)
	}
	openClawAnnotateImageRollout(h, registeredImage, templateGW, runGW)
	return h
}

func openClawProbeBaseURLs(inst *AppOpenClawInstance) []string {
	if inst == nil {
		return nil
	}
	var out []string
	add := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		for _, x := range out {
			if x == s {
				return
			}
		}
		out = append(out, s)
	}
	add(inst.PublicV1URL)
	add(inst.ExternalV1URL)
	add(inst.ClusterV1BaseURL)
	return out
}

func openClawProbeGETURLs(base string) []string {
	b := strings.TrimSuffix(strings.TrimSpace(base), "/")
	if b == "" {
		return nil
	}
	return []string{b + "/models", b}
}

func openClawGatewayProbe(ctx context.Context, inst *AppOpenClawInstance, bearerToken string) gin.H {
	out := gin.H{"ok": false, "httpStatus": 0, "urlTried": "", "message": ""}
	cli := &http.Client{
		Timeout: 8 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
			Proxy:           http.ProxyFromEnvironment,
		},
	}
	lastErr := ""
	for _, base := range openClawProbeBaseURLs(inst) {
		for _, u := range openClawProbeGETURLs(base) {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				lastErr = err.Error()
				continue
			}
			if strings.TrimSpace(bearerToken) != "" {
				req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(bearerToken))
			}
			resp, err := cli.Do(req)
			if err != nil {
				lastErr = err.Error()
				out["urlTried"] = u
				continue
			}
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			out["httpStatus"] = resp.StatusCode
			out["urlTried"] = u
			if resp.StatusCode < 500 {
				out["ok"] = true
				out["message"] = http.StatusText(resp.StatusCode)
				if resp.StatusCode == http.StatusUnauthorized {
					out["message"] = "HTTP 401（网关在线，需有效 Token）"
				}
				return out
			}
			lastErr = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
	}
	if ut, _ := out["urlTried"].(string); ut == "" {
		out["message"] = "未配置可探测的访问地址（公网 / NodePort / 集群内）"
	} else {
		out["message"] = lastErr
		if lastErr == "" {
			out["message"] = "无法建立可用 HTTP 响应"
		}
	}
	return out
}

type openClawChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

const openClawChatTimeout = 240 * time.Second

func openClawPostDirectChatCompletions(ctx context.Context, openAIBaseURL, apiKey, model string, messages []openClawChatMsg, ext map[string]interface{}, clientTimeout time.Duration, skipTLSVerify bool) (string, int, error) {
	base := strings.TrimRight(strings.TrimSpace(openAIBaseURL), "/")
	if base == "" || strings.TrimSpace(apiKey) == "" {
		return "", 0, fmt.Errorf("缺少上游 Base URL 或 API Key")
	}
	model = strings.TrimSpace(model)
	if model == "" {
		model = defaultOpenClawFallbackChatModelID
	}
	u := openClawOpenAIChatCompletionsURL(base)
	if u == "" {
		return "", 0, fmt.Errorf("无法拼接上游 chat/completions URL")
	}
	payload := map[string]interface{}{"model": model, "messages": messages}
	for k, v := range ext {
		payload[k] = v
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", 0, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(raw))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(apiKey))
	if clientTimeout <= 0 {
		clientTimeout = openClawChatTimeout
	}
	tr := &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: skipTLSVerify, MinVersion: tls.VersionTLS12}}
	cli := &http.Client{Timeout: clientTimeout, Transport: tr}
	resp, err := cli.Do(req)
	if err != nil {
		return "", 0, fmt.Errorf("[上游模型接入层·直连 Secret 中 OPENAI_BASE_URL] 请求失败（网络/DNS/TLS/超时等）: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", resp.StatusCode, fmt.Errorf("[上游模型接入层·直连] 读取响应体失败: %w", err)
	}
	if resp.StatusCode >= 400 {
		return "", resp.StatusCode, fmt.Errorf("[上游模型接入层·直连 OPENAI_BASE_URL，不经 OpenClaw 网关] HTTP %d: %s", resp.StatusCode, truncateErrMessage(string(body), 800))
	}
	var wrap struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return "", resp.StatusCode, fmt.Errorf("[上游模型接入层·直连] 解析 JSON 失败: %w", err)
	}
	if len(wrap.Choices) == 0 {
		return "", resp.StatusCode, fmt.Errorf("[上游模型接入层·直连] 响应中无 choices")
	}
	return strings.TrimSpace(wrap.Choices[0].Message.Content), resp.StatusCode, nil
}

func openClawExplainHealthChatProbeError(err error, timeout time.Duration) string {
	if err == nil {
		return ""
	}
	sec := int(timeout / time.Second)
	msg := err.Error()
	low := strings.ToLower(msg)
	deadline := errors.Is(err, context.DeadlineExceeded) || strings.Contains(low, "deadline exceeded") || strings.Contains(low, "context deadline exceeded")
	if deadline {
		return fmt.Sprintf("【超时】约 %ds 内未收到完整响应（网关或上游过慢、无响应）。请查 Secret 的 OPENAI_API_KEY、OPENAI_BASE_URL、代理与出站；可调环境变量 KUBEBT_OPENCLAW_GATEWAY_HEALTH_CHAT_TIMEOUT_SEC。详情：%s",
			sec, truncateErrMessage(msg, 260))
	}
	if strings.Contains(low, "connection refused") || strings.Contains(low, "no such host") {
		return fmt.Sprintf("【连不上】无法建立到网关的连接（拒绝连接或域名解析失败）。详情：%s", truncateErrMessage(msg, 280))
	}
	if strings.Contains(low, "i/o timeout") || strings.Contains(low, "client.timeout") {
		return fmt.Sprintf("【网络超时】与网关通信在等待阶段超时。请查 Service/Endpoints、网络策略与节点出站。详情：%s", truncateErrMessage(msg, 280))
	}
	if strings.Contains(msg, "EOF") || strings.Contains(low, "unexpected eof") {
		return "【连接提前结束·EOF】对端在返回完整 HTTP 响应前关闭了连接。常见：网关进程退出/重启、Pod 未就绪、Service 无 Endpoints、或到 18789 的 TCP 被重置。请 kubectl logs deployment/<网关名> -n <命名空间> 与 kubectl get endpoints。"
	}
	if strings.Contains(low, "connection reset by peer") || strings.Contains(low, "reset by peer") {
		return "【连接被重置】对端主动 RST。常见：网关崩溃、端口错、或中间设备断开长连接。请查网关 Pod 事件与日志。"
	}
	if strings.Contains(low, "broken pipe") {
		return "【连接已断开·broken pipe】写入时连接已被关闭。请查网关是否稳定、是否频繁重启。"
	}
	if strings.Contains(low, "tls") && (strings.Contains(low, "handshake") || strings.Contains(low, "certificate")) {
		return fmt.Sprintf("【TLS 错误】与网关 HTTPS 握手或证书校验失败。详情：%s", truncateErrMessage(msg, 220))
	}
	if strings.Contains(low, "use of closed network connection") {
		return "【连接已关闭】使用了已关闭的网络连接。请重试并查网关 Pod 是否重启。"
	}
	return fmt.Sprintf("【传输错误·无有效 HTTP 响应】%s", truncateErrMessage(msg, 380))
}

func openClawReadUpstreamCredentials(ctx context.Context, k8s *kubernetes.Clientset, inst *AppOpenClawInstance) (baseURL, apiKey string, err error) {
	if k8s == nil || inst == nil {
		return "", "", fmt.Errorf("K8s 或未指定实例")
	}
	ns := strings.TrimSpace(inst.Namespace)
	secName := strings.TrimSpace(inst.SecretName)
	if secName == "" {
		secName = "openclaw-secrets"
	}
	sec, err := k8s.CoreV1().Secrets(ns).Get(ctx, secName, metav1.GetOptions{})
	if err != nil {
		return "", "", err
	}
	get := func(keys ...string) string {
		for _, k := range keys {
			if b, ok := sec.Data[k]; ok && strings.TrimSpace(string(b)) != "" {
				return strings.TrimSpace(string(b))
			}
		}
		return ""
	}
	return get("OPENAI_BASE_URL", "openaiBaseUrl"), get("OPENAI_API_KEY", "openaiApiKey"), nil
}
