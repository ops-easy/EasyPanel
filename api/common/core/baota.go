package core

import (
	"errors"
	"net/http"
	"time"

	baotaprovider "github.com/ops-easy/EasyPanel/api/api/baota/provider"
)

func baotaOptions(cfg Config) baotaprovider.Options {
	return baotaprovider.Options{
		URL:                  cfg.BaotaURL,
		APIKey:               cfg.BaotaAPIKey,
		SkipTLSVerify:        cfg.BaotaSkipTLSVerify,
		DisableHTTPKeepAlive: cfg.BaotaDisableHTTPKeepAlive,
		HTTPTimeout:          cfg.BaotaHTTPTimeout,
		TCPProbeTimeout:      cfg.BaotaTCPProbeTimeout,
	}
}

func joinBaotaURL(base, apiPath string) string {
	return baotaprovider.JoinURL(base, apiPath)
}

func newBaotaHTTPClient(cfg Config, timeout time.Duration) *http.Client {
	return baotaprovider.NewHTTPClient(baotaOptions(cfg), timeout)
}

func baotaHTTPClientCached(cfg Config, timeout time.Duration) *http.Client {
	return baotaprovider.HTTPClientCached(baotaOptions(cfg), timeout)
}

// CallBaotaAPI 站点/SSL 等常规接口，使用 BAOTA_HTTP_TIMEOUT_SEC（仅同步创建/删除/证书等业务路径调用）。
func CallBaotaAPI(cfg Config, apiPath string, params map[string]string) (string, error) {
	return baotaprovider.CallAPI(baotaOptions(cfg), apiPath, params)
}

func parseBaotaURLHostPort(raw string) (host, port string, err error) {
	return baotaprovider.ParseURLHostPort(raw)
}

func baotaTCPDialTimeout(cfg Config) time.Duration {
	t := cfg.BaotaTCPProbeTimeout
	if t <= 0 {
		return 5 * time.Second
	}
	return t
}

// ProbeBaotaTCP 仅检测面板 TCP 端口是否可达，不调用宝塔 HTTP API。
func ProbeBaotaTCP(cfg Config) error {
	return baotaprovider.ProbeTCP(baotaOptions(cfg))
}

// ProbeBaotaTCPFromURL 供独立工具使用，仅 TCP 拨号。
func ProbeBaotaTCPFromURL(baotaURL string, dialTimeout time.Duration) error {
	return baotaprovider.ProbeTCPFromURL(baotaURL, dialTimeout)
}

func doBaotaPOST(cfg Config, timeout time.Duration, apiPath string, params map[string]string) (string, error) {
	opts := baotaOptions(cfg)
	opts.HTTPTimeout = timeout
	return baotaprovider.CallAPI(opts, apiPath, params)
}

func interpretBaotaJSONBody(body string) error {
	return baotaprovider.InterpretJSONBody(body)
}

func baotaStatusOK(v interface{}) bool {
	return baotaprovider.StatusOK(v)
}

// errBaotaAlreadyExists 表示站点/反代已存在，同步可忽略。
var errBaotaAlreadyExists = baotaprovider.ErrAlreadyExists

func IsBaotaAlreadyExists(err error) bool {
	return err != nil && errors.Is(err, errBaotaAlreadyExists)
}
