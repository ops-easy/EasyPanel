package provider

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	pvemodel "kube-bt-sync/api/pve/model"
)

type Client struct {
	target      pvemodel.Target
	secretPlain string
	ticket      string
	csrfToken   string
	httpClient  *http.Client
}

func NormalizeBaseURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", errors.New("PVE 地址不能为空")
	}
	if !strings.HasPrefix(strings.ToLower(s), "http://") && !strings.HasPrefix(strings.ToLower(s), "https://") {
		s = "https://" + s
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", err
	}
	if u.Hostname() == "" {
		return "", errors.New("PVE 地址缺少主机名")
	}
	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "8006"
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if u.Scheme == "" {
		u.Scheme = "https"
	}
	u.Host = net.JoinHostPort(host, port)
	u.Path = strings.TrimSuffix(u.Path, "/")
	if strings.HasSuffix(u.Path, "/api2/json") {
		u.Path = strings.TrimSuffix(strings.TrimSuffix(u.Path, "/api2/json"), "/")
	}
	if u.Path == "/" {
		u.Path = ""
	}
	u.RawQuery = ""
	u.Fragment = ""
	return strings.TrimRight(u.String(), "/"), nil
}

func BuildAuthHeader(tokenID, tokenSecret string) string {
	return "PVEAPIToken=" + strings.TrimSpace(tokenID) + "=" + strings.TrimSpace(tokenSecret)
}

func ValidateGuestPowerAction(action string) error {
	switch action {
	case "start", "stop", "shutdown", "reboot", "reset":
		return nil
	default:
		return fmt.Errorf("不支持的 PVE 电源操作: %s", action)
	}
}

func NewClient(target pvemodel.Target, tokenPlain string) (*Client, error) {
	base, err := NormalizeBaseURL(target.BaseURL)
	if err != nil {
		return nil, err
	}
	target.BaseURL = base
	tr := &http.Transport{}
	if target.SkipTLS {
		tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true} //nolint:gosec // 用户显式允许内网自签证书。
	}
	return &Client{
		target:      target,
		secretPlain: tokenPlain,
		httpClient:  &http.Client{Timeout: 20 * time.Second, Transport: tr},
	}, nil
}

func (c *Client) apiURL(path string, query url.Values) string {
	base := strings.TrimRight(c.target.BaseURL, "/") + "/api2/json/" + strings.TrimLeft(path, "/")
	if len(query) > 0 {
		base += "?" + query.Encode()
	}
	return base
}

func (c *Client) APIWebSocketURL(path string, query url.Values) (string, error) {
	u, err := url.Parse(c.target.BaseURL)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "https":
		u.Scheme = "wss"
	case "http":
		u.Scheme = "ws"
	default:
		return "", fmt.Errorf("unsupported PVE API scheme: %s", u.Scheme)
	}
	cleanPath := strings.TrimPrefix(path, "/")
	if strings.Contains(cleanPath, "?") {
		return "", errors.New("pve websocket path must not contain query")
	}
	u.Path = "/api2/json/" + cleanPath
	if len(query) > 0 {
		u.RawQuery = query.Encode()
	}
	return u.String(), nil
}

func (c *Client) WebSocketAuthHeader(ctx context.Context) (http.Header, error) {
	header := http.Header{}
	if TargetAuthMethod(c.target) == AuthMethodPassword {
		if err := c.ensurePasswordTicket(ctx); err != nil {
			return nil, err
		}
		header.Add("Cookie", (&http.Cookie{Name: "PVEAuthCookie", Value: c.ticket}).String())
		if strings.TrimSpace(c.csrfToken) != "" {
			header.Set("CSRFPreventionToken", c.csrfToken)
		}
		return header, nil
	}
	header.Set("Authorization", BuildAuthHeader(c.target.TokenID, c.secretPlain))
	return header, nil
}

func (c *Client) SkipTLSVerify() bool {
	return c.target.SkipTLS
}

func (c *Client) ensurePasswordTicket(ctx context.Context) error {
	if strings.TrimSpace(c.ticket) != "" {
		return nil
	}
	username := strings.TrimSpace(PasswordLoginUsername(c.target))
	if username == "" {
		return errors.New("PVE 用户名不能为空")
	}
	if strings.TrimSpace(c.secretPlain) == "" {
		return errors.New("PVE 密码不能为空")
	}
	form := url.Values{}
	form.Set("username", username)
	form.Set("password", c.secretPlain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL("/access/ticket", nil), strings.NewReader(form.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return fmt.Errorf("PVE 账号密码无效或权限不足（HTTP %d）", res.StatusCode)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("PVE 登录失败（HTTP %d）: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var wrapper struct {
		Data struct {
			Ticket              string `json:"ticket"`
			CSRFPreventionToken string `json:"CSRFPreventionToken"`
		} `json:"data"`
	}
	if err := json.Unmarshal(b, &wrapper); err != nil {
		return fmt.Errorf("PVE 登录返回 JSON 无效: %w", err)
	}
	if strings.TrimSpace(wrapper.Data.Ticket) == "" {
		return errors.New("PVE 登录返回 ticket 为空")
	}
	c.ticket = wrapper.Data.Ticket
	c.csrfToken = wrapper.Data.CSRFPreventionToken
	return nil
}

func (c *Client) Do(ctx context.Context, method, path string, query url.Values, body any) (json.RawMessage, error) {
	authMethod := TargetAuthMethod(c.target)
	if authMethod == AuthMethodPassword {
		if err := c.ensurePasswordTicket(ctx); err != nil {
			return nil, err
		}
	}
	var reader io.Reader
	contentType := ""
	if body != nil {
		switch v := body.(type) {
		case url.Values:
			reader = strings.NewReader(v.Encode())
			contentType = "application/x-www-form-urlencoded"
		default:
			b, err := json.Marshal(body)
			if err != nil {
				return nil, err
			}
			reader = bytes.NewReader(b)
			contentType = "application/json"
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.apiURL(path, query), reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if authMethod == AuthMethodPassword {
		req.AddCookie(&http.Cookie{Name: "PVEAuthCookie", Value: c.ticket})
		if method != http.MethodGet && strings.TrimSpace(c.csrfToken) != "" {
			req.Header.Set("CSRFPreventionToken", c.csrfToken)
		}
	} else {
		req.Header.Set("Authorization", BuildAuthHeader(c.target.TokenID, c.secretPlain))
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		if authMethod == AuthMethodPassword {
			return nil, fmt.Errorf("PVE 账号密码无效或权限不足（HTTP %d）", res.StatusCode)
		}
		return nil, fmt.Errorf("PVE Token 无效或权限不足（HTTP %d）", res.StatusCode)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("PVE API 请求失败（HTTP %d）: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var wrapper struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(b, &wrapper); err != nil {
		return nil, fmt.Errorf("PVE 返回 JSON 无效: %w", err)
	}
	if wrapper.Data == nil {
		return json.RawMessage(`null`), nil
	}
	return wrapper.Data, nil
}

func GuestPowerPath(node, guestType, vmid, action string) (string, error) {
	if err := ValidateGuestPowerAction(action); err != nil {
		return "", err
	}
	node = strings.TrimSpace(node)
	vmid = strings.TrimSpace(vmid)
	if node == "" || vmid == "" {
		return "", errors.New("node 与 vmid 不能为空")
	}
	if _, err := strconv.Atoi(vmid); err != nil {
		return "", errors.New("vmid 必须为数字")
	}
	switch strings.ToLower(strings.TrimSpace(guestType)) {
	case "qemu", "vm":
		return fmt.Sprintf("/nodes/%s/qemu/%s/status/%s", url.PathEscape(node), url.PathEscape(vmid), action), nil
	case "lxc", "ct":
		return fmt.Sprintf("/nodes/%s/lxc/%s/status/%s", url.PathEscape(node), url.PathEscape(vmid), action), nil
	default:
		return "", errors.New("type 须为 qemu 或 lxc")
	}
}
