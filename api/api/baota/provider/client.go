package provider

import (
	"crypto/md5"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Options struct {
	URL                  string
	APIKey               string
	SkipTLSVerify        bool
	DisableHTTPKeepAlive bool
	HTTPTimeout          time.Duration
	TCPProbeTimeout      time.Duration
}

func JoinURL(base, apiPath string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	apiPath = strings.TrimSpace(apiPath)
	if apiPath == "" {
		return base
	}
	if !strings.HasPrefix(apiPath, "/") {
		apiPath = "/" + apiPath
	}
	return base + apiPath
}

func NewHTTPClient(opts Options, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	dialer := &net.Dialer{
		Timeout:   15 * time.Second,
		KeepAlive: 60 * time.Second,
	}
	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		MaxIdleConns:          32,
		MaxIdleConnsPerHost:   8,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   30 * time.Second,
		ResponseHeaderTimeout: 0,
		DialContext:           dialer.DialContext,
		DisableKeepAlives:     opts.DisableHTTPKeepAlive,
	}
	if opts.SkipTLSVerify {
		tr.TLSClientConfig = &tls.Config{
			InsecureSkipVerify: true,
			MinVersion:         tls.VersionTLS12,
		}
	}
	return &http.Client{
		Timeout:   timeout,
		Transport: tr,
	}
}

var (
	httpMu     sync.Mutex
	httpClient *http.Client
	httpSig    string
)

func HTTPClientCached(opts Options, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	sig := fmt.Sprintf("%v|%v|%d", opts.SkipTLSVerify, opts.DisableHTTPKeepAlive, timeout/time.Millisecond)
	httpMu.Lock()
	defer httpMu.Unlock()
	if httpClient != nil && httpSig == sig {
		return httpClient
	}
	httpClient = NewHTTPClient(opts, timeout)
	httpSig = sig
	return httpClient
}

func CallAPI(opts Options, apiPath string, params map[string]string) (string, error) {
	t := opts.HTTPTimeout
	if t <= 0 {
		t = 45 * time.Second
	}
	return doPOST(opts, t, apiPath, params)
}

func ParseURLHostPort(raw string) (host, port string, err error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" {
		return "", "", errors.New("无效的 BAOTA_URL")
	}
	host = u.Hostname()
	if host == "" {
		return "", "", errors.New("无效的 BAOTA_URL：缺少主机名")
	}
	port = u.Port()
	if port == "" {
		if strings.EqualFold(u.Scheme, "https") {
			port = "443"
		} else {
			port = "80"
		}
	}
	return host, port, nil
}

func ProbeTCP(opts Options) error {
	return ProbeTCPFromURL(opts.URL, opts.TCPProbeTimeout)
}

func ProbeTCPFromURL(baotaURL string, dialTimeout time.Duration) error {
	host, port, err := ParseURLHostPort(baotaURL)
	if err != nil {
		return err
	}
	if dialTimeout <= 0 {
		dialTimeout = 5 * time.Second
	}
	d := net.Dialer{Timeout: dialTimeout}
	conn, err := d.Dial("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return fmt.Errorf("宝塔 TCP %s:%s 不可达: %w", host, port, err)
	}
	_ = conn.Close()
	return nil
}

func doPOST(opts Options, timeout time.Duration, apiPath string, params map[string]string) (string, error) {
	timestamp := fmt.Sprintf("%d", time.Now().Unix())
	md5Key := fmt.Sprintf("%x", md5.Sum([]byte(opts.APIKey)))
	requestToken := fmt.Sprintf("%x", md5.Sum([]byte(timestamp+md5Key)))

	data := url.Values{}
	data.Set("request_time", timestamp)
	data.Set("request_token", requestToken)
	for k, v := range params {
		data.Set(k, v)
	}

	reqURL := JoinURL(opts.URL, apiPath)
	req, err := http.NewRequest("POST", reqURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Add("Content-Type", "application/x-www-form-urlencoded")

	resp, err := HTTPClientCached(opts, timeout).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return "", errors.New("宝塔 API 返回异常状态: " + resp.Status)
	}
	bodyStr := string(bodyBytes)
	if err := InterpretJSONBody(bodyStr); err != nil {
		return "", err
	}
	return bodyStr, nil
}

func InterpretJSONBody(body string) error {
	trim := strings.TrimSpace(body)
	if trim == "" || trim[0] != '{' && trim[0] != '[' {
		return nil
	}
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(trim), &m); err != nil {
		return nil
	}
	st, ok := m["status"]
	if !ok {
		return nil
	}
	if StatusOK(st) {
		return nil
	}
	msg := ""
	if s, ok := m["msg"].(string); ok {
		msg = s
	}
	if msg == "" {
		msg = "宝塔 API 返回 status=false"
	}
	low := strings.ToLower(msg)
	if strings.Contains(msg, "已存在") || strings.Contains(msg, "同名") ||
		strings.Contains(low, "exist") || strings.Contains(msg, "重复") {
		return fmt.Errorf("%s: %w", msg, ErrAlreadyExists)
	}
	return errors.New("宝塔 API: " + msg)
}

func StatusOK(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	case string:
		x = strings.TrimSpace(strings.ToLower(x))
		return x == "true" || x == "1" || x == "yes"
	default:
		return true
	}
}

var ErrAlreadyExists = errors.New("baota resource already exists")

func IsAlreadyExists(err error) bool {
	return err != nil && errors.Is(err, ErrAlreadyExists)
}
