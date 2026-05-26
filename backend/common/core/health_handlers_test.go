package core

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"

	"github.com/gin-gonic/gin"
)

func TestLoginPublicStatusReportsPVEConfiguredFromTargets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	kv := newTestPlatformKV()
	if err := kv.Set(pveprovider.KVKeyTargets, `{"targets":[{"id":"pve-1","name":"PVE","baseUrl":"https://pve.example:8006"}]}`); err != nil {
		t.Fatalf("seed pve targets: %v", err)
	}
	app := &ServerApp{platformKV: kv}

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/login/public-status", nil)

	handleLoginPublicStatus(app)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var payload struct {
		Runtime struct {
			PVEConfigured bool `json:"pveConfigured"`
		} `json:"runtime"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if !payload.Runtime.PVEConfigured {
		t.Fatalf("pveConfigured=false, want true")
	}
}
