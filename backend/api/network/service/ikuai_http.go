package service

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
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"

	"github.com/gin-gonic/gin"
)

type ikuaiHTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

type ikuaiHTTPClient struct {
	doer ikuaiHTTPDoer
}

type ikuaiActionRequest struct {
	FuncName string         `json:"func_name"`
	Action   string         `json:"action"`
	Param    map[string]any `json:"param,omitempty"`
}

func newIkuaiHTTPClient(doer ikuaiHTTPDoer) *ikuaiHTTPClient {
	if doer == nil {
		jar, _ := cookiejar.New(nil)
		doer = &http.Client{Timeout: 20 * time.Second, Jar: jar}
	}
	return &ikuaiHTTPClient{doer: doer}
}

func buildIkuaiLoginPayload(username, password string) map[string]string {
	sum := md5.Sum([]byte(password))
	passwd := hex.EncodeToString(sum[:])
	return map[string]string{
		"username": strings.TrimSpace(username),
		"passwd":   passwd,
		"pass":     passwd,
	}
}

func handleIkuaiProbe(c *gin.Context, app *ServerApp) {
	var body networkDeviceBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	dev := normalizeNetworkDeviceInput(networkmodel.Device{
		Kind:          networkDeviceKindIkuai,
		Name:          strings.TrimSpace(body.Name),
		APIURL:        strings.TrimSpace(body.APIURL),
		Host:          strings.TrimSpace(body.Host),
		Port:          body.Port,
		AuthType:      ikuaiAuthTypeHTTPWeb,
		Username:      strings.TrimSpace(body.Username),
		Password:      body.Password,
		SkipTLSVerify: body.SkipTLSVerify,
	})
	if strings.TrimSpace(dev.APIURL) == "" && strings.TrimSpace(dev.Host) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "iKuai management address requires apiUrl or host"})
		return
	}
	if strings.TrimSpace(dev.Username) == "" || strings.TrimSpace(dev.Password) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "iKuai HTTP login requires username and password"})
		return
	}
	out, err := ikuaiHTTPClientForDevice(dev).Probe(c.Request.Context(), dev)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"probe": out, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"probe": out})
}

func (c *ikuaiHTTPClient) Probe(ctx context.Context, dev networkmodel.Device) (map[string]any, error) {
	if err := c.login(ctx, dev); err != nil {
		return map[string]any{"reachable": false, "source": "ikuai-http", "checkedAt": time.Now().UTC().Format(time.RFC3339)}, err
	}
	results, errs := c.readDomain(ctx, dev, "system")
	out := map[string]any{
		"reachable": true,
		"source":    "ikuai-http",
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
		"capability": map[bool]string{
			true:  "full",
			false: "partial",
		}[len(results) > 0],
		"results": results,
		"errors":  errs,
	}
	return out, nil
}

func (c *ikuaiHTTPClient) ConfigSnapshot(ctx context.Context, dev networkmodel.Device, domain string) (map[string]any, error) {
	if strings.TrimSpace(dev.APIURL) == "" && strings.TrimSpace(dev.Host) == "" {
		return map[string]any{
			"provider":   networkDeviceKindIkuai,
			"domain":     domain,
			"source":     "ikuai-http",
			"capability": "not-configured",
			"checkedAt":  time.Now().UTC().Format(time.RFC3339),
			"sections":   []any{},
			"errors":     []string{"iKuai management address is not configured"},
		}, nil
	}
	if err := c.login(ctx, dev); err != nil {
		return nil, err
	}
	results, errs := c.readDomain(ctx, dev, domain)
	capability := "full"
	if len(results) == 0 {
		capability = "unsupported"
		errs = append(errs, "current iKuai firmware did not return data for this domain")
	} else if len(errs) > 0 {
		capability = "partial"
	}
	return map[string]any{
		"provider":   networkDeviceKindIkuai,
		"domain":     domain,
		"source":     "ikuai-http",
		"capability": capability,
		"checkedAt":  time.Now().UTC().Format(time.RFC3339),
		"sections":   results,
		"errors":     errs,
		"raw":        results,
	}, nil
}

func (c *ikuaiHTTPClient) ApplyChangeSet(ctx context.Context, dev networkmodel.Device, body networkChangeSet) (map[string]any, error) {
	preview, err := buildIkuaiChangePreview(body.Domain, body)
	if err != nil {
		return map[string]any{"preview": preview}, err
	}
	if !body.Confirm {
		return map[string]any{"preview": preview}, errors.New("iKuai apply requires confirm=true")
	}
	if err := c.login(ctx, dev); err != nil {
		return map[string]any{"preview": preview}, err
	}
	results := []map[string]any{}
	for _, req := range preview.Requests {
		raw, err := c.callAction(ctx, dev, req)
		results = append(results, map[string]any{"request": req, "response": raw, "ok": err == nil})
		if err != nil {
			return map[string]any{"provider": networkDeviceKindIkuai, "domain": body.Domain, "preview": preview, "results": results}, err
		}
	}
	return map[string]any{
		"provider":  networkDeviceKindIkuai,
		"domain":    body.Domain,
		"ok":        true,
		"preview":   preview,
		"results":   results,
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (c *ikuaiHTTPClient) RunAction(ctx context.Context, dev networkmodel.Device, body networkActionRequest) (map[string]any, error) {
	if !body.Confirm {
		return nil, errors.New("iKuai action requires confirm=true")
	}
	action := strings.ToLower(strings.TrimSpace(body.Action))
	req := ikuaiActionRequest{}
	if body.Fields != nil {
		req = ikuaiActionRequestFromFields(body.Fields)
	}
	if req.FuncName == "" {
		switch action {
		case "reboot":
			req = ikuaiActionRequest{FuncName: "system", Action: "reboot", Param: map[string]any{}}
		default:
			return nil, fmt.Errorf("unsupported iKuai action %s", body.Action)
		}
	}
	if err := c.login(ctx, dev); err != nil {
		return nil, err
	}
	raw, err := c.callAction(ctx, dev, req)
	return map[string]any{
		"provider":  networkDeviceKindIkuai,
		"action":    body.Action,
		"request":   req,
		"response":  raw,
		"ok":        err == nil,
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
	}, err
}

func buildIkuaiChangePreview(domain string, body networkChangeSet) (networkChangePreview, error) {
	requests := make([]ikuaiActionRequest, 0, len(body.Changes))
	warnings := []string{}
	for _, ch := range body.Changes {
		req := ikuaiActionRequestFromChange(domain, ch)
		if req.FuncName == "" || req.Action == "" {
			warnings = append(warnings, "iKuai change requires funcName and action or a supported preset")
			continue
		}
		requests = append(requests, req)
	}
	if len(body.Changes) > 0 && len(requests) == 0 {
		return networkChangePreview{}, errors.New("no supported iKuai change requests")
	}
	capability := "ikuai-http"
	unsupported := []string{}
	if len(requests) == 0 {
		capability = "read-only"
		unsupported = append(unsupported, "no write change provided")
	}
	return networkChangePreview{
		Provider:             networkDeviceKindIkuai,
		Domain:               normalizeConfigDomain(domain),
		Capability:           capability,
		Requests:             requests,
		Warnings:             warnings,
		Unsupported:          unsupported,
		RequiresConfirmation: true,
	}, nil
}

func ikuaiActionRequestFromChange(domain string, ch networkConfigChange) ikuaiActionRequest {
	if ch.FuncName != "" || ch.Action != "" {
		return ikuaiActionRequest{FuncName: ch.FuncName, Action: ch.Action, Param: safeParam(ch.Param)}
	}
	if ch.Fields != nil {
		req := ikuaiActionRequestFromFields(ch.Fields)
		if req.FuncName != "" || req.Action != "" {
			return req
		}
	}
	funcName := defaultIkuaiFuncName(domain, ch.Section)
	if funcName == "" {
		return ikuaiActionRequest{}
	}
	action := strings.ToLower(strings.TrimSpace(ch.Operation))
	if action == "" || action == "set" || action == "update" {
		action = "edit"
	}
	if action == "delete" || action == "remove" {
		action = "del"
	}
	param := map[string]any{}
	if strings.TrimSpace(ch.Target) != "" {
		param["target"] = strings.TrimSpace(ch.Target)
	}
	if strings.TrimSpace(ch.Section) != "" {
		param["section"] = strings.TrimSpace(ch.Section)
	}
	if strings.TrimSpace(ch.Value) != "" {
		var decoded any
		if json.Unmarshal([]byte(ch.Value), &decoded) == nil {
			if m, ok := decoded.(map[string]any); ok {
				param = m
			} else {
				param["value"] = decoded
			}
		} else {
			param["value"] = ch.Value
		}
	}
	return ikuaiActionRequest{FuncName: funcName, Action: action, Param: param}
}

func ikuaiActionRequestFromFields(fields map[string]any) ikuaiActionRequest {
	funcName := stringFromAny(fields["funcName"])
	if funcName == "" {
		funcName = stringFromAny(fields["func_name"])
	}
	action := stringFromAny(fields["action"])
	param := map[string]any{}
	if raw, ok := fields["param"].(map[string]any); ok {
		param = raw
	}
	return ikuaiActionRequest{FuncName: funcName, Action: action, Param: safeParam(param)}
}

func defaultIkuaiFuncName(domain, section string) string {
	d := normalizeConfigDomain(domain)
	s := strings.ToLower(strings.TrimSpace(section))
	if strings.Contains(s, "dhcp") {
		return "dhcp_server"
	}
	if strings.Contains(s, "nat") || strings.Contains(s, "port") {
		return "portmap"
	}
	switch d {
	case "interfaces":
		return "wan"
	case "clients":
		return "monitor_lanip"
	case "wireless":
		return "wireless"
	case "dhcp":
		return "dhcp_server"
	case "dns":
		return "dnsmasq"
	case "connections", "firewall":
		return "acl"
	case "monitoring", "system", "services":
		return "sysstat"
	default:
		return ""
	}
}

func (c *ikuaiHTTPClient) readDomain(ctx context.Context, dev networkmodel.Device, domain string) ([]map[string]any, []string) {
	requests := ikuaiReadRequests(domain)
	results := []map[string]any{}
	errs := []string{}
	for _, req := range requests {
		raw, err := c.callAction(ctx, dev, req)
		if err != nil {
			errs = append(errs, fmt.Sprintf("%s/%s: %v", req.FuncName, req.Action, err))
			continue
		}
		results = append(results, map[string]any{"request": req, "response": raw})
	}
	return results, errs
}

func ikuaiReadRequests(domain string) []ikuaiActionRequest {
	switch normalizeConfigDomain(domain) {
	case "interfaces":
		return []ikuaiActionRequest{
			{FuncName: "wan", Action: "show", Param: map[string]any{}},
			{FuncName: "lan", Action: "show", Param: map[string]any{}},
			{FuncName: "interface", Action: "show", Param: map[string]any{}},
		}
	case "clients":
		return []ikuaiActionRequest{
			{FuncName: "monitor_lanip", Action: "show", Param: map[string]any{}},
			{FuncName: "static_arp", Action: "show", Param: map[string]any{}},
		}
	case "wireless":
		return []ikuaiActionRequest{{FuncName: "wireless", Action: "show", Param: map[string]any{}}}
	case "connections":
		return []ikuaiActionRequest{
			{FuncName: "monitor_lanip", Action: "show", Param: map[string]any{}},
			{FuncName: "acl", Action: "show", Param: map[string]any{}},
			{FuncName: "portmap", Action: "show", Param: map[string]any{}},
		}
	case "dhcp":
		return []ikuaiActionRequest{{FuncName: "dhcp_server", Action: "show", Param: map[string]any{}}}
	case "dns":
		return []ikuaiActionRequest{{FuncName: "dnsmasq", Action: "show", Param: map[string]any{}}}
	case "monitoring", "system", "services":
		return []ikuaiActionRequest{
			{FuncName: "sysstat", Action: "show", Param: map[string]any{}},
			{FuncName: "sys_info", Action: "show", Param: map[string]any{}},
		}
	default:
		return []ikuaiActionRequest{{FuncName: "sysstat", Action: "show", Param: map[string]any{}}}
	}
}

func (c *ikuaiHTTPClient) login(ctx context.Context, dev networkmodel.Device) error {
	if strings.TrimSpace(dev.Username) == "" || strings.TrimSpace(dev.Password) == "" {
		return errors.New("iKuai HTTP credentials are not configured")
	}
	var raw any
	return c.postJSON(ctx, dev, "/Action/login", buildIkuaiLoginPayload(dev.Username, dev.Password), &raw)
}

func (c *ikuaiHTTPClient) callAction(ctx context.Context, dev networkmodel.Device, req ikuaiActionRequest) (map[string]any, error) {
	var raw map[string]any
	err := c.postJSON(ctx, dev, "/Action/call", req, &raw)
	return raw, err
}

func (c *ikuaiHTTPClient) postJSON(ctx context.Context, dev networkmodel.Device, path string, payload any, out any) error {
	base, err := ikuaiBaseURL(dev)
	if err != nil {
		return err
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	resp, err := c.doer.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("iKuai HTTP %s returned %d: %s", path, resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	if len(respBody) == 0 || out == nil {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		var text string
		if json.Unmarshal(respBody, &text) == nil {
			return nil
		}
		return err
	}
	return nil
}

func ikuaiBaseURL(dev networkmodel.Device) (string, error) {
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
			host = fmt.Sprintf("%s:%d", host, dev.Port)
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

func safeParam(param map[string]any) map[string]any {
	if param == nil {
		return map[string]any{}
	}
	return param
}

func stringFromAny(v any) string {
	if s, ok := v.(string); ok {
		return strings.TrimSpace(s)
	}
	return ""
}

func ikuaiHTTPClientForDevice(dev networkmodel.Device) *ikuaiHTTPClient {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	if dev.SkipTLSVerify {
		transport.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
	}
	jar, _ := cookiejar.New(nil)
	return &ikuaiHTTPClient{doer: &http.Client{Timeout: 20 * time.Second, Jar: jar, Transport: transport}}
}
