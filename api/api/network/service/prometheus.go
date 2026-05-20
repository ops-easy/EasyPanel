package service

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	appcenterprovider "kube-bt-sync/api/appcenter/provider"
)

type promSample struct {
	Metric map[string]string
	Value  float64
}

type promInstantResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Metric map[string]string `json:"metric"`
			Value  []any             `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

func prometheusBaseForNetworkScope(cfg Config, scope string) string {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "network":
		if s := appcenterprovider.GetPrometheusURLForScope(cfg, "network"); strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
		if s := appcenterprovider.GetPrometheusURLForScope(cfg, "vcenter"); strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
		return strings.TrimSpace(appcenterprovider.GetPrometheusURLForScope(cfg, ""))
	case "vcenter":
		return strings.TrimSpace(appcenterprovider.GetPrometheusURLForScope(cfg, "vcenter"))
	default:
		return strings.TrimSpace(appcenterprovider.GetPrometheusURLForScope(cfg, ""))
	}
}

func promQueryInstant(base, q string) ([]promSample, error) {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" {
		return nil, fmt.Errorf("未配置 Prometheus")
	}
	u := base + "/api/v1/query?query=" + url.QueryEscape(q)
	client := http.Client{Timeout: 15 * time.Second}
	res, err := client.Get(u)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, fmt.Errorf("Prometheus HTTP %d: %s", res.StatusCode, strings.TrimSpace(string(b)))
	}
	var parsed promInstantResponse
	if err := json.Unmarshal(b, &parsed); err != nil {
		return nil, err
	}
	if parsed.Status != "success" {
		return nil, fmt.Errorf("Prometheus status=%s", parsed.Status)
	}
	out := make([]promSample, 0, len(parsed.Data.Result))
	for _, r := range parsed.Data.Result {
		if len(r.Value) < 2 {
			continue
		}
		f, ok := anyToFloat(r.Value[1])
		if !ok {
			continue
		}
		out = append(out, promSample{Metric: r.Metric, Value: f})
	}
	return out, nil
}

func anyToFloat(v any) (float64, bool) {
	switch x := v.(type) {
	case float64:
		return x, true
	case string:
		var f float64
		if _, err := fmt.Sscanf(x, "%f", &f); err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}
