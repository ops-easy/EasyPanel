package core

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	networkmodel "github.com/ops-easy/EasyPanel/backend/api/network/model"
	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
	sharedcrypto "github.com/ops-easy/EasyPanel/backend/common/crypto"

	"github.com/gin-gonic/gin"
)

func TestProbeBaotaForSystemCheckTreatsMissingAPIKeyAsNotConfigured(t *testing.T) {
	status, msg := probeBaotaForSystemCheck(Config{BaotaURL: "http://127.0.0.1:8888"})

	if status != "not_configured" {
		t.Fatalf("status = %q, want not_configured; msg=%q", status, msg)
	}
	if strings.Contains(msg, "127.0.0.1") || strings.Contains(strings.ToLower(msg), "dial tcp") {
		t.Fatalf("msg leaked probe details: %q", msg)
	}
}

func TestBuildSystemCheckResponseIncludesUnifiedReadOnlyChecks(t *testing.T) {
	oldVCenter := systemCheckProbeVCenter
	oldPVE := systemCheckProbePVE
	oldOpenWrt := systemCheckProbeOpenWrt
	oldIkuai := systemCheckProbeIkuai
	oldPrometheus := systemCheckProbePrometheus
	oldVictoriaLogs := systemCheckProbeVictoriaLogs
	defer func() {
		systemCheckProbeVCenter = oldVCenter
		systemCheckProbePVE = oldPVE
		systemCheckProbeOpenWrt = oldOpenWrt
		systemCheckProbeIkuai = oldIkuai
		systemCheckProbePrometheus = oldPrometheus
		systemCheckProbeVictoriaLogs = oldVictoriaLogs
	}()

	systemCheckProbeVCenter = func(context.Context, *ServerApp) gin.H {
		return gin.H{"status": "readonly_reachable", "configured": true, "reachable": true, "readonly": true, "msg": "vCenter CurrentTime 可读"}
	}
	systemCheckProbePVE = func(context.Context, *ServerApp) gin.H {
		return gin.H{"status": "configured_unreachable", "configured": true, "reachable": false, "readonly": false, "targetCount": 1, "msg": "PVE API 请求失败"}
	}
	systemCheckProbeOpenWrt = func(context.Context, *ServerApp) gin.H {
		return gin.H{"status": "readonly_reachable", "configured": true, "reachable": true, "readonly": true, "targetCount": 1, "msg": "OpenWrt ubus 只读可达"}
	}
	systemCheckProbeIkuai = func(context.Context, *ServerApp) gin.H {
		return gin.H{"status": "not_configured", "configured": false, "reachable": false, "readonly": false, "targetCount": 0, "msg": "未配置 iKuai"}
	}
	systemCheckProbePrometheus = func(context.Context, Config) gin.H {
		return gin.H{"status": "datasource_error", "configured": true, "reachable": false, "readonly": false, "msg": "Prometheus status=error"}
	}
	systemCheckProbeVictoriaLogs = func(context.Context, *ServerApp) gin.H {
		return gin.H{"status": "readonly_reachable", "configured": true, "reachable": true, "readonly": true, "msg": "VictoriaLogs LogsQL 可读"}
	}

	out := buildSystemCheckResponse(context.Background(), &ServerApp{platformKV: newTestPlatformKV()}, DashboardRoleAdmin)
	checks, ok := out["checks"].(gin.H)
	if !ok {
		t.Fatalf("checks missing or wrong type: %#v", out["checks"])
	}
	for name, want := range map[string]string{
		"vcenter":      "readonly_reachable",
		"pve":          "configured_unreachable",
		"openwrt":      "readonly_reachable",
		"ikuai":        "not_configured",
		"prometheus":   "datasource_error",
		"victoriaLogs": "readonly_reachable",
	} {
		gotCheck, ok := checks[name].(gin.H)
		if !ok {
			t.Fatalf("checks[%s] missing or wrong type: %#v", name, checks[name])
		}
		if gotCheck["status"] != want {
			t.Fatalf("checks[%s].status=%q, want %q", name, gotCheck["status"], want)
		}
	}
}

func TestProbePrometheusForSystemCheckDistinguishesDatasourceError(t *testing.T) {
	t.Run("unconfigured", func(t *testing.T) {
		got := probePrometheusForSystemCheck(context.Background(), Config{})
		if got["status"] != "not_configured" || got["configured"] != false {
			t.Fatalf("probe=%#v, want not_configured", got)
		}
	})

	t.Run("readonly reachable", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path != "/api/v1/query" {
				t.Fatalf("path=%q, want /api/v1/query", r.URL.Path)
			}
			_, _ = w.Write([]byte(`{"status":"success","data":{"resultType":"scalar","result":[1710000000,"1"]}}`))
		}))
		defer srv.Close()

		got := probePrometheusForSystemCheck(context.Background(), Config{PrometheusURLK8s: srv.URL})
		if got["status"] != "readonly_reachable" || got["readonly"] != true {
			t.Fatalf("probe=%#v, want readonly_reachable", got)
		}
	})

	t.Run("datasource error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"status":"error","error":"bad query"}`))
		}))
		defer srv.Close()

		got := probePrometheusForSystemCheck(context.Background(), Config{PrometheusURLK8s: srv.URL})
		if got["status"] != "datasource_error" || got["configured"] != true {
			t.Fatalf("probe=%#v, want datasource_error", got)
		}
	})
}

func TestProbeVictoriaLogsForSystemCheckDistinguishesDatasourceError(t *testing.T) {
	t.Run("unconfigured", func(t *testing.T) {
		got := probeVictoriaLogsForSystemCheck(context.Background(), &ServerApp{})
		if got["status"] != "not_configured" || got["configured"] != false {
			t.Fatalf("probe=%#v, want not_configured", got)
		}
	})

	t.Run("readonly reachable", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPost || r.URL.Path != "/select/logsql/query" {
				t.Fatalf("%s %s, want POST /select/logsql/query", r.Method, r.URL.Path)
			}
			_, _ = w.Write([]byte("{\"_msg\":\"ok\"}\n"))
		}))
		defer srv.Close()

		got := probeVictoriaLogsForSystemCheck(context.Background(), &ServerApp{cfg: Config{VictoriaLogsURL: srv.URL}})
		if got["status"] != "readonly_reachable" || got["readonly"] != true {
			t.Fatalf("probe=%#v, want readonly_reachable", got)
		}
	})

	t.Run("datasource error", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "boom", http.StatusBadGateway)
		}))
		defer srv.Close()

		got := probeVictoriaLogsForSystemCheck(context.Background(), &ServerApp{cfg: Config{VictoriaLogsURL: srv.URL}})
		if got["status"] != "datasource_error" || got["configured"] != true {
			t.Fatalf("probe=%#v, want datasource_error", got)
		}
	})
}

func TestProbePVEForSystemCheckUsesReadOnlyVersionEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api2/json/version" {
			t.Fatalf("path=%q, want /api2/json/version", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "PVEAPIToken=root@pam!easypanel=secret" {
			t.Fatalf("Authorization=%q, want PVE token header", got)
		}
		_, _ = w.Write([]byte(`{"data":{"version":"8.2.0"}}`))
	}))
	defer srv.Close()

	key, err := sharedcrypto.DeriveAESKey("test-encryption-key")
	if err != nil {
		t.Fatalf("derive key: %v", err)
	}
	secretEnc, err := sharedcrypto.EncryptSecret(key, "secret")
	if err != nil {
		t.Fatalf("encrypt secret: %v", err)
	}
	targetsRaw, err := json.Marshal(map[string]any{
		"targets": []pvemodel.Target{{
			ID:             "pve-1",
			Name:           "PVE",
			BaseURL:        srv.URL,
			AuthMethod:     pveprovider.AuthMethodToken,
			TokenID:        "root@pam!easypanel",
			TokenSecretEnc: secretEnc,
		}},
	})
	if err != nil {
		t.Fatalf("marshal targets: %v", err)
	}
	kv := newTestPlatformKV()
	if err := kv.Set(pveprovider.KVKeyTargets, string(targetsRaw)); err != nil {
		t.Fatalf("seed pve targets: %v", err)
	}

	got := probePVEForSystemCheck(context.Background(), &ServerApp{
		cfg:        Config{EncryptionKey: "test-encryption-key"},
		platformKV: kv,
	})
	if got["status"] != "readonly_reachable" || got["readonly"] != true || got["targetCount"] != 1 {
		t.Fatalf("probe=%#v, want readonly reachable targetCount=1", got)
	}
}

func TestProbeNetworkKindForSystemCheckUsesReadOnlyDeviceProbe(t *testing.T) {
	oldOpenWrt := systemCheckOpenWrtReadOnlyProbe
	oldIkuai := systemCheckIkuaiReadOnlyProbe
	defer func() {
		systemCheckOpenWrtReadOnlyProbe = oldOpenWrt
		systemCheckIkuaiReadOnlyProbe = oldIkuai
	}()
	systemCheckOpenWrtReadOnlyProbe = func(context.Context, *ServerApp, networkmodel.Device) error {
		return nil
	}
	systemCheckIkuaiReadOnlyProbe = func(context.Context, *ServerApp, networkmodel.Device) error {
		return errSystemCheckProbeUnreachable("iKuai login failed")
	}

	raw, err := json.Marshal(map[string]any{
		"devices": []networkmodel.Device{
			{ID: "ow-1", Name: "OpenWrt", Kind: "openwrt", Host: "192.0.2.10", Username: "root", PasswordEnc: "set"},
			{ID: "ik-1", Name: "iKuai", Kind: "ikuai", APIURL: "http://192.0.2.1", Username: "admin", PasswordEnc: "set"},
		},
	})
	if err != nil {
		t.Fatalf("marshal network devices: %v", err)
	}
	kv := newTestPlatformKV()
	if err := kv.Set(kvKeyInspectNetworkDevices, string(raw)); err != nil {
		t.Fatalf("seed network devices: %v", err)
	}
	app := &ServerApp{platformKV: kv}

	openwrt := probeNetworkKindForSystemCheck(context.Background(), app, "openwrt")
	if openwrt["status"] != "readonly_reachable" || openwrt["targetCount"] != 1 {
		t.Fatalf("openwrt probe=%#v, want readonly reachable", openwrt)
	}
	ikuai := probeNetworkKindForSystemCheck(context.Background(), app, "ikuai")
	if ikuai["status"] != "configured_unreachable" || ikuai["targetCount"] != 1 {
		t.Fatalf("ikuai probe=%#v, want configured_unreachable", ikuai)
	}
}
