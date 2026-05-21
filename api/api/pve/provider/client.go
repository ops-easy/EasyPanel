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
	target     pvemodel.Target
	tokenPlain string
	httpClient *http.Client
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
		target:     target,
		tokenPlain: strings.TrimSpace(tokenPlain),
		httpClient: &http.Client{Timeout: 20 * time.Second, Transport: tr},
	}, nil
}

func (c *Client) apiURL(path string, query url.Values) string {
	base := strings.TrimRight(c.target.BaseURL, "/") + "/api2/json/" + strings.TrimLeft(path, "/")
	if len(query) > 0 {
		base += "?" + query.Encode()
	}
	return base
}

func (c *Client) Do(ctx context.Context, method, path string, query url.Values, body any) (json.RawMessage, error) {
	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.apiURL(path, query), reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", BuildAuthHeader(c.target.TokenID, c.tokenPlain))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
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
