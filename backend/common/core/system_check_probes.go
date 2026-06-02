package core

import (
	"bytes"
	"context"
	"crypto/md5"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"sync"
	"time"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"

	"github.com/gin-gonic/gin"
	"github.com/vmware/govmomi"
	"github.com/vmware/govmomi/vim25/methods"
	"golang.org/x/crypto/ssh"
)

const (
	systemCheckStatusNotConfigured         = "not_configured"
	systemCheckStatusConfiguredUnreachable = "configured_unreachable"
	systemCheckStatusReadonlyReachable     = "readonly_reachable"
	systemCheckStatusDatasourceError       = "datasource_error"
	systemCheckStatusHidden                = "hidden"
)

var (
	systemCheckProbeVCenter = probeVCenterForSystemCheck
	systemCheckProbePVE     = probePVEForSystemCheck
	systemCheckProbeOpenWrt = func(ctx context.Context, app *ServerApp) gin.H {
		return probeNetworkKindForSystemCheck(ctx, app, "openwrt")
	}
	systemCheckProbeIkuai = func(ctx context.Context, app *ServerApp) gin.H {
		return probeNetworkKindForSystemCheck(ctx, app, "ikuai")
	}
	systemCheckProbePrometheus   = probePrometheusForSystemCheck
	systemCheckProbeVictoriaLogs = probeVictoriaLogsForSystemCheck

	systemCheckOpenWrtReadOnlyProbe = probeOpenWrtReadOnlyForSystemCheck
	systemCheckIkuaiReadOnlyProbe   = probeIkuaiReadOnlyForSystemCheck
)

func systemCheckItem(status string, configured, reachable, readonly bool, msg string) gin.H {
	return gin.H{
		"status":     status,
		"configured": configured,
		"reachable":  reachable,
		"readonly":   readonly,
		"msg":        truncateErrMessage(strings.TrimSpace(msg), 300),
		"checkedAt":  time.Now().UTC().Format(time.RFC3339),
	}
}

func systemCheckNotConfigured(msg string) gin.H {
	return systemCheckItem(systemCheckStatusNotConfigured, false, false, false, msg)
}

func systemCheckReadonlyReachable(msg string) gin.H {
	return systemCheckItem(systemCheckStatusReadonlyReachable, true, true, true, msg)
}

func systemCheckConfiguredUnreachable(msg string) gin.H {
	return systemCheckItem(systemCheckStatusConfiguredUnreachable, true, false, false, msg)
}

func systemCheckDatasourceError(msg string) gin.H {
	return systemCheckItem(systemCheckStatusDatasourceError, true, false, false, msg)
}

func systemCheckProbeContext(ctx context.Context) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, 4*time.Second)
}

func buildHiddenSystemCheckItems(msg string) gin.H {
	return gin.H{
		"vcenter":      systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
		"pve":          systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
		"openwrt":      systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
		"ikuai":        systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
		"prometheus":   systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
		"victoriaLogs": systemCheckItem(systemCheckStatusHidden, false, false, false, msg),
	}
}

func buildSystemCheckItems(ctx context.Context, app *ServerApp) gin.H {
	type job struct {
		name string
		run  func(context.Context) gin.H
	}
	cfg := Config{}
	if app != nil {
		cfg = app.Cfg()
	}
	jobs := []job{
		{name: "vcenter", run: func(c context.Context) gin.H { return systemCheckProbeVCenter(c, app) }},
		{name: "pve", run: func(c context.Context) gin.H { return systemCheckProbePVE(c, app) }},
		{name: "openwrt", run: func(c context.Context) gin.H { return systemCheckProbeOpenWrt(c, app) }},
		{name: "ikuai", run: func(c context.Context) gin.H { return systemCheckProbeIkuai(c, app) }},
		{name: "prometheus", run: func(c context.Context) gin.H { return systemCheckProbePrometheus(c, cfg) }},
		{name: "victoriaLogs", run: func(c context.Context) gin.H { return systemCheckProbeVictoriaLogs(c, app) }},
	}
	out := gin.H{}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, j := range jobs {
		j := j
		wg.Add(1)
		go func() {
			defer wg.Done()
			cctx, cancel := systemCheckProbeContext(ctx)
			defer cancel()
			item := j.run(cctx)
			mu.Lock()
			out[j.name] = item
			mu.Unlock()
		}()
	}
	wg.Wait()
	return out
}

func probeVCenterForSystemCheck(ctx context.Context, app *ServerApp) gin.H {
	if app == nil {
		return systemCheckNotConfigured("应用上下文不可用，无法检查 vCenter")
	}
	cfg := app.Cfg()
	if !cfg.vCenterConfigured() {
		out := systemCheckNotConfigured("未配置 vCenter（需要 URL、用户与密码）")
		out["runtimeConfigured"] = VCenterRuntimeCredentialsPresent(cfg)
		out["urlHint"] = maskVCenterURL(cfg.VCenterURL)
		return out
	}
	vc := app.VCenter()
	if vc == nil {
		vc = newVCenterClient(cfg)
	}
	err := vc.WithClientRetry(ctx, func(_ *govmomi.Client) error {
		return nil
	})
	if err == nil {
		err = vc.WithClientRetry(ctx, func(client *govmomi.Client) error {
			_, e := methods.GetCurrentTime(ctx, client.Client)
			return e
		})
	}
	if err != nil {
		out := systemCheckConfiguredUnreachable("vCenter 只读探活失败: " + err.Error())
		out["urlHint"] = maskVCenterURL(cfg.VCenterURL)
		return out
	}
	out := systemCheckReadonlyReachable("vCenter API CurrentTime 只读可达")
	out["urlHint"] = maskVCenterURL(cfg.VCenterURL)
	return out
}

func probePVEForSystemCheck(ctx context.Context, app *ServerApp) gin.H {
	if app == nil || app.PlatformKV() == nil {
		return systemCheckNotConfigured("未配置 PVE 目标")
	}
	targets, err := pveprovider.LoadTargets(app.PlatformKV())
	if err != nil {
		return systemCheckConfiguredUnreachable("读取 PVE 目标失败: " + err.Error())
	}
	configured := targets[:0]
	for _, target := range targets {
		if strings.TrimSpace(target.BaseURL) != "" {
			configured = append(configured, target)
		}
	}
	if len(configured) == 0 {
		return systemCheckNotConfigured("未配置 PVE 目标")
	}
	key, keyErr := sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
	reachable := 0
	errs := []string{}
	for _, target := range configured {
		if keyErr != nil {
			errs = append(errs, keyErr.Error())
			continue
		}
		secret, err := pveprovider.DecryptTargetCredential(key, target)
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		client, err := pveprovider.NewClient(target, secret)
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		if _, err := client.Do(ctx, http.MethodGet, "/version", nil, nil); err != nil {
			errs = append(errs, err.Error())
			continue
		}
		reachable++
	}
	if reachable > 0 {
		out := systemCheckReadonlyReachable("PVE /version 只读可达")
		out["targetCount"] = len(configured)
		out["reachableCount"] = reachable
		return out
	}
	out := systemCheckConfiguredUnreachable("PVE 已配置但只读探活失败: " + strings.Join(errs, "；"))
	out["targetCount"] = len(configured)
	out["reachableCount"] = 0
	return out
}

func probePrometheusForSystemCheck(ctx context.Context, cfg Config) gin.H {
	scopes := []string{"k8s", "vcenter", "pve", "network", "cloud"}
	scopeChecks := gin.H{}
	configuredCount := 0
	reachableCount := 0
	errs := []string{}
	for _, scope := range scopes {
		base := strings.TrimSpace(GetPrometheusURLForScope(cfg, scope))
		if base == "" {
			scopeChecks[scope] = systemCheckNotConfigured("未配置 " + scope + " Prometheus / VictoriaMetrics")
			continue
		}
		configuredCount++
		item := probePrometheusScopeForSystemCheck(ctx, cfg, scope)
		scopeChecks[scope] = item
		if item["status"] == systemCheckStatusReadonlyReachable {
			reachableCount++
		} else if msg, ok := item["msg"].(string); ok && msg != "" {
			errs = append(errs, scope+": "+msg)
		}
	}
	if configuredCount == 0 {
		out := systemCheckNotConfigured("未配置 Prometheus / VictoriaMetrics 数据源")
		out["scopes"] = scopeChecks
		return out
	}
	if reachableCount > 0 {
		out := systemCheckReadonlyReachable("Prometheus / VictoriaMetrics 即时查询只读可达")
		out["scopes"] = scopeChecks
		out["configuredScopes"] = configuredCount
		out["reachableScopes"] = reachableCount
		return out
	}
	out := systemCheckDatasourceError("Prometheus / VictoriaMetrics 数据源异常: " + strings.Join(errs, "；"))
	out["scopes"] = scopeChecks
	out["configuredScopes"] = configuredCount
	out["reachableScopes"] = 0
	return out
}

func probePrometheusScopeForSystemCheck(ctx context.Context, cfg Config, scope string) gin.H {
	base := strings.TrimSpace(GetPrometheusURLForScope(cfg, scope))
	if base == "" {
		return systemCheckNotConfigured("未配置 " + scope + " Prometheus / VictoriaMetrics")
	}
	body, status, err := prometheusFetchInstantWithContext(ctx, cfg, scope, "1")
	if err != nil {
		out := systemCheckDatasourceError(err.Error())
		out["urlHint"] = maskPrometheusURL(base)
		return out
	}
	if _, msg := parsePrometheusInstantQueryFirstScalar(body, status); msg != "" {
		out := systemCheckDatasourceError(msg)
		out["urlHint"] = maskPrometheusURL(base)
		return out
	}
	out := systemCheckReadonlyReachable(scope + " Prometheus / VictoriaMetrics 即时查询可读")
	out["urlHint"] = maskPrometheusURL(base)
	return out
}

func prometheusFetchInstantWithContext(ctx context.Context, cfg Config, scope, q string) (body []byte, status int, err error) {
	base := GetPrometheusURLForScope(cfg, scope)
	if base == "" {
		return nil, 0, fmt.Errorf("no prometheus")
	}
	u, err := url.Parse(strings.TrimRight(base, "/"))
	if err != nil {
		return nil, 0, err
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/api/v1/query"
	uv := url.Values{}
	uv.Set("query", q)
	u.RawQuery = uv.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	if tok := strings.TrimSpace(cfg.PrometheusBearerToken); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	resp, err := prometheusHTTPClient(cfg).Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, err = io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return body, resp.StatusCode, nil
}

func probeVictoriaLogsForSystemCheck(ctx context.Context, app *ServerApp) gin.H {
	if app == nil {
		return systemCheckNotConfigured("未配置 VictoriaLogs 数据源")
	}
	cfg := app.Cfg()
	base := normalizeVictoriaLogsBase(effectiveVictoriaLogsURL(app.Runtime(), cfg))
	if base == "" {
		return systemCheckNotConfigured("未配置 VictoriaLogs 数据源")
	}
	end := time.Now().UTC()
	start := end.Add(-5 * time.Minute)
	_, _, _, _, err := fetchVictoriaLogsNDJSON(ctx, cfg, base, "*", 1, start.Format(time.RFC3339Nano), end.Format(time.RFC3339Nano))
	if err != nil {
		out := systemCheckDatasourceError("VictoriaLogs LogsQL 查询失败: " + err.Error())
		out["urlHint"] = maskPrometheusURL(base)
		return out
	}
	out := systemCheckReadonlyReachable("VictoriaLogs LogsQL 只读可达")
	out["urlHint"] = maskPrometheusURL(base)
	return out
}

func probeNetworkKindForSystemCheck(ctx context.Context, app *ServerApp, kind string) gin.H {
	if app == nil || app.PlatformKV() == nil {
		return systemCheckNotConfigured("未配置 " + kind + " 设备")
	}
	devices, err := loadInspectNetworkDevices(app.PlatformKV())
	if err != nil {
		return systemCheckConfiguredUnreachable("读取网络设备失败: " + err.Error())
	}
	targets := []networkmodel.Device{}
	for _, dev := range devices {
		if strings.EqualFold(strings.TrimSpace(dev.Kind), kind) {
			targets = append(targets, dev)
		}
	}
	if len(targets) == 0 {
		return systemCheckNotConfigured("未配置 " + networkKindLabel(kind) + " 设备")
	}
	reachable := 0
	errs := []string{}
	for _, dev := range targets {
		var err error
		if strings.EqualFold(kind, "openwrt") {
			err = systemCheckOpenWrtReadOnlyProbe(ctx, app, dev)
		} else {
			err = systemCheckIkuaiReadOnlyProbe(ctx, app, dev)
		}
		if err != nil {
			errs = append(errs, err.Error())
			continue
		}
		reachable++
	}
	if reachable > 0 {
		out := systemCheckReadonlyReachable(networkKindLabel(kind) + " 只读探活可达")
		out["targetCount"] = len(targets)
		out["reachableCount"] = reachable
		return out
	}
	out := systemCheckConfiguredUnreachable(networkKindLabel(kind) + " 已配置但只读探活失败: " + strings.Join(errs, "；"))
	out["targetCount"] = len(targets)
	out["reachableCount"] = 0
	return out
}

func networkKindLabel(kind string) string {
	if strings.EqualFold(kind, "openwrt") {
		return "OpenWrt"
	}
	if strings.EqualFold(kind, "ikuai") {
		return "iKuai"
	}
	return strings.TrimSpace(kind)
}

func errSystemCheckProbeUnreachable(msg string) error {
	return errors.New(strings.TrimSpace(msg))
}

func decryptNetworkDeviceForSystemCheck(app *ServerApp, dev networkmodel.Device) (networkmodel.Device, error) {
	if strings.TrimSpace(dev.PasswordEnc) == "" && strings.TrimSpace(dev.PrivateKeyEnc) == "" {
		return dev, nil
	}
	key, err := sharedcrypto.DeriveAESKey(app.Cfg().EncryptionKey)
	if err != nil {
		return dev, err
	}
	if strings.TrimSpace(dev.PasswordEnc) != "" {
		dev.Password, err = sharedcrypto.DecryptSecret(key, dev.PasswordEnc)
		if err != nil {
			return dev, err
		}
	}
	if strings.TrimSpace(dev.PrivateKeyEnc) != "" {
		dev.PrivateKey, err = sharedcrypto.DecryptSecret(key, dev.PrivateKeyEnc)
		if err != nil {
			return dev, err
		}
	}
	return dev, nil
}

func probeOpenWrtReadOnlyForSystemCheck(ctx context.Context, app *ServerApp, dev networkmodel.Device) error {
	dev, err := decryptNetworkDeviceForSystemCheck(app, dev)
	if err != nil {
		return err
	}
	host := strings.TrimSpace(dev.Host)
	if host == "" {
		return errors.New("OpenWrt 目标缺少 host")
	}
	port := dev.Port
	if port == 0 {
		port = 22
	}
	auth := []ssh.AuthMethod{}
	if strings.TrimSpace(dev.PrivateKey) != "" {
		signer, err := ssh.ParsePrivateKey([]byte(dev.PrivateKey))
		if err != nil {
			return fmt.Errorf("OpenWrt SSH 私钥解析失败: %w", err)
		}
		auth = append(auth, ssh.PublicKeys(signer))
	}
	if strings.TrimSpace(dev.Password) != "" {
		auth = append(auth, ssh.Password(dev.Password))
	}
	if len(auth) == 0 {
		return errors.New("OpenWrt 目标缺少 SSH 密码或私钥")
	}
	user := strings.TrimSpace(dev.Username)
	if user == "" {
		user = "root"
	}
	addr := net.JoinHostPort(host, fmt.Sprint(port))
	dialer := net.Dialer{Timeout: 4 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	config := &ssh.ClientConfig{
		User:            user,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         4 * time.Second,
	}
	cc, chans, reqs, err := ssh.NewClientConn(conn, addr, config)
	if err != nil {
		return err
	}
	client := ssh.NewClient(cc, chans, reqs)
	defer client.Close()
	session, err := client.NewSession()
	if err != nil {
		return err
	}
	defer session.Close()
	_, err = session.CombinedOutput("ubus call system board")
	return err
}

func probeIkuaiReadOnlyForSystemCheck(ctx context.Context, app *ServerApp, dev networkmodel.Device) error {
	dev, err := decryptNetworkDeviceForSystemCheck(app, dev)
	if err != nil {
		return err
	}
	base, err := ikuaiSystemCheckBaseURL(dev)
	if err != nil {
		return err
	}
	jar, _ := cookiejar.New(nil)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if dev.SkipTLSVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true, MinVersion: tls.VersionTLS12}
	}
	client := &http.Client{Timeout: 4 * time.Second, Jar: jar, Transport: transport}
	loginPayload := ikuaiSystemCheckLoginPayload(dev.Username, dev.Password)
	if err := ikuaiSystemCheckPostJSON(ctx, client, base+"/Action/login", loginPayload, nil); err != nil {
		return err
	}
	readPayload := gin.H{"func_name": "sysstat", "action": "show", "param": gin.H{}}
	return ikuaiSystemCheckPostJSON(ctx, client, base+"/Action/call", readPayload, nil)
}

func ikuaiSystemCheckLoginPayload(username, password string) gin.H {
	sum := md5.Sum([]byte(password))
	passwd := hex.EncodeToString(sum[:])
	return gin.H{
		"username": strings.TrimSpace(username),
		"passwd":   passwd,
		"pass":     passwd,
	}
}

func ikuaiSystemCheckBaseURL(dev networkmodel.Device) (string, error) {
	raw := strings.TrimSpace(dev.APIURL)
	if raw == "" {
		host := strings.TrimSpace(dev.Host)
		if host == "" {
			return "", errors.New("iKuai management address is not configured")
		}
		scheme := "http"
		if dev.Port == 443 {
			scheme = "https"
		}
		if dev.Port > 0 {
			host = net.JoinHostPort(host, fmt.Sprint(dev.Port))
		}
		raw = scheme + "://" + host
	}
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" {
		u.Scheme = "http"
	}
	if u.Host == "" {
		u.Host = u.Path
		u.Path = ""
	}
	return strings.TrimRight(u.String(), "/"), nil
}

func ikuaiSystemCheckPostJSON(ctx context.Context, client *http.Client, endpoint string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("iKuai HTTP %s returned %d: %s", endpoint, resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return err
		}
	}
	return nil
}
