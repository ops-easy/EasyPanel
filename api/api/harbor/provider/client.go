package provider

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("harbor not configured")

type ClientConfig struct {
	BaseURL  string
	Username string
	Password string
	SkipTLS  bool
	Timeout  time.Duration
}

type Client struct {
	cfg        ClientConfig
	httpClient *http.Client
}

func Configured(baseURL, username, password string) bool {
	return strings.TrimSpace(baseURL) != "" &&
		strings.TrimSpace(username) != "" &&
		strings.TrimSpace(password) != ""
}

func APIRoot(baseURL string) string {
	b := strings.TrimSuffix(strings.TrimSpace(baseURL), "/")
	if b == "" {
		return ""
	}
	return b + "/api/v2.0"
}

func NewHTTPClient(skipTLS bool, timeout time.Duration) *http.Client {
	if timeout <= 0 {
		timeout = 60 * time.Second
	}
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
			TLSClientConfig: &tls.Config{
				InsecureSkipVerify: skipTLS,
				MinVersion:         tls.VersionTLS12,
			},
		},
	}
}

func NewClient(cfg ClientConfig) *Client {
	return &Client{
		cfg:        cfg,
		httpClient: NewHTTPClient(cfg.SkipTLS, cfg.Timeout),
	}
}

func (c *Client) Do(ctx context.Context, method, pathAndQuery string, body io.Reader) ([]byte, int, error) {
	root := APIRoot(c.cfg.BaseURL)
	if root == "" {
		return nil, 0, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx, method, root+pathAndQuery, body)
	if err != nil {
		return nil, 0, err
	}
	req.SetBasicAuth(strings.TrimSpace(c.cfg.Username), c.cfg.Password)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	return b, resp.StatusCode, err
}

func (c *Client) DoGET404RepoAlt(ctx context.Context, primary, alt string) ([]byte, int, error) {
	b, code, err := c.Do(ctx, http.MethodGet, primary, nil)
	if err != nil || code != http.StatusNotFound || strings.TrimSpace(alt) == "" || alt == primary {
		return b, code, err
	}
	return c.Do(ctx, http.MethodGet, alt, nil)
}

func (c *Client) DoMethod404RepoAlt(ctx context.Context, method, primary, alt string, body io.Reader) ([]byte, int, error) {
	b, code, err := c.Do(ctx, method, primary, body)
	if err != nil || code != http.StatusNotFound || strings.TrimSpace(alt) == "" || alt == primary {
		return b, code, err
	}
	return c.Do(ctx, method, alt, body)
}

func (c *Client) ArtifactListRepoPathEsc(ctx context.Context, projEsc, repoRel string) string {
	cands := RepositoryPathSegmentCandidates(repoRel)
	if len(cands) == 0 {
		return ""
	}
	if len(cands) == 1 {
		return cands[0]
	}
	p1 := fmt.Sprintf("/projects/%s/repositories/%s/artifacts?page=1&page_size=1", projEsc, cands[0])
	_, c1, err := c.Do(ctx, http.MethodGet, p1, nil)
	if err != nil || c1 != http.StatusNotFound {
		return cands[0]
	}
	p2 := fmt.Sprintf("/projects/%s/repositories/%s/artifacts?page=1&page_size=1", projEsc, cands[1])
	_, c2, err2 := c.Do(ctx, http.MethodGet, p2, nil)
	if err2 == nil && c2 == http.StatusOK {
		return cands[1]
	}
	return cands[0]
}

func (c *Client) FetchSystemInfoMap(ctx context.Context) map[string]any {
	b, code, err := c.Do(ctx, http.MethodGet, "/systeminfo", nil)
	if err != nil || code != http.StatusOK || len(b) == 0 {
		return nil
	}
	var m map[string]any
	if json.Unmarshal(b, &m) != nil {
		return nil
	}
	return m
}
