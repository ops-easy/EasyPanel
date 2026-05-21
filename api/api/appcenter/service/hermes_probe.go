package service

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type HermesProbeResult struct {
	Ready       bool     `json:"ready"`
	Mode        string   `json:"mode"`
	GatewayOK   bool     `json:"gatewayOk"`
	DashboardOK bool     `json:"dashboardOk"`
	Models      []string `json:"models,omitempty"`
	Message     string   `json:"message"`
	CheckedAt   string   `json:"checkedAt"`
	Errors      []string `json:"errors,omitempty"`
	Status      gin.H    `json:"status,omitempty"`
}

func buildHermesProbeCommand(kind string) []string {
	switch kind {
	case "dashboard":
		return []string{"sh", "-lc", `wget -qO- http://127.0.0.1:9119/ || curl -fsS http://127.0.0.1:9119/`}
	default:
		return []string{"sh", "-lc", `wget -qO- --header="Authorization: Bearer $API_SERVER_KEY" http://127.0.0.1:8642/v1/models || curl -fsS -H "Authorization: Bearer $API_SERVER_KEY" http://127.0.0.1:8642/v1/models`}
	}
}

func handleAppHermesRuntimeProbe(c *gin.Context, app *ServerApp) {
	inst, ok := loadHermesInstanceByParam(c, app)
	if !ok {
		return
	}
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 40*time.Second)
	defer cancel()
	result := probeHermesRuntime(ctx, app, *inst)
	_, _ = patchHermesInstance(app.PlatformKV(), inst.ID, func(x *HermesInstance) {
		x.Ready = result.Ready
		x.LastProbeAt = result.CheckedAt
		x.LastProbeError = strings.Join(result.Errors, "; ")
	})
	c.JSON(200, result)
}

func probeHermesRuntime(ctx context.Context, app *ServerApp, inst HermesInstance) HermesProbeResult {
	result := HermesProbeResult{
		Mode:      inst.Mode,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
		Status:    collectHermesK8sStatus(ctx, app, inst),
	}
	k8sReady, _ := result.Status["ready"].(bool)
	if inst.Mode == "gateway" || inst.Mode == "gateway-dashboard" {
		pod, container, err := hermesPickExecTargetForMode(ctx, app, inst, "gateway")
		if err != nil {
			result.Errors = append(result.Errors, "gateway pod: "+err.Error())
		} else {
			stdout, stderr, err := k8sPodExecRun(ctx, app.K8s(), app.K8sREST(), inst.Namespace, pod, container, buildHermesProbeCommand("gateway"), nil)
			if err != nil {
				result.Errors = append(result.Errors, "gateway: "+err.Error()+" "+stderr.String())
			} else {
				result.GatewayOK = true
				result.Models = parseHermesModels(stdout.String())
			}
		}
	}
	if inst.Mode == "dashboard" || inst.Mode == "gateway-dashboard" {
		pod, container, err := hermesPickExecTargetForMode(ctx, app, inst, "dashboard")
		if err != nil {
			result.Errors = append(result.Errors, "dashboard pod: "+err.Error())
		} else {
			stdout, stderr, err := k8sPodExecRun(ctx, app.K8s(), app.K8sREST(), inst.Namespace, pod, container, buildHermesProbeCommand("dashboard"), nil)
			if err != nil {
				result.Errors = append(result.Errors, "dashboard: "+err.Error()+" "+stderr.String())
			} else {
				result.DashboardOK = strings.TrimSpace(stdout.String()) != ""
			}
		}
	}
	switch inst.Mode {
	case "gateway":
		result.Ready = k8sReady && result.GatewayOK
	case "dashboard":
		result.Ready = k8sReady && result.DashboardOK
	default:
		result.Ready = k8sReady && result.GatewayOK && result.DashboardOK
	}
	if result.Ready {
		result.Message = "Hermes 运行时探测通过"
	} else {
		result.Message = "Hermes 运行时探测未通过"
	}
	return result
}

func hermesPickExecTargetForMode(ctx context.Context, app *ServerApp, inst HermesInstance, mode string) (string, string, error) {
	cp := inst
	cp.Mode = mode
	return hermesPickExecTarget(ctx, app, cp)
}

func parseHermesModels(raw string) []string {
	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil
	}
	out := []string{}
	for _, row := range payload.Data {
		if strings.TrimSpace(row.ID) != "" {
			out = append(out, strings.TrimSpace(row.ID))
		}
	}
	return out
}
