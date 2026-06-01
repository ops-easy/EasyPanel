package core

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newVCenterTestContext(method, path, body string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = params
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c, w
}

func assertVCenterMissingConfirm(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s, want %d", w.Code, w.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func TestVCenterVMPowerRejectsMissingConfirmationBeforeConnecting(t *testing.T) {
	c, w := newVCenterTestContext(http.MethodPost, "/api/vcenter/vms/vm-101/power", `{"action":"off"}`, gin.Params{{Key: "moref", Value: "vm-101"}})
	handleVCenterVMPower(c, nil)

	assertVCenterMissingConfirm(t, w)
}

func TestVCenterVMPowerActionsRequireConfirmation(t *testing.T) {
	for _, action := range []string{"on", "off", "suspend", "reset", "shutdown_guest", "reboot_guest", "standby_guest"} {
		canonical, _, err := normalizeVCenterVMPowerAction(action)
		if err != nil {
			t.Fatalf("normalizeVCenterVMPowerAction(%q) returned error: %v", action, err)
		}
		if !vCenterVMPowerActionRequiresConfirm(canonical) {
			t.Fatalf("vCenter VM power action %q should require explicit confirmation", action)
		}
	}
}

func TestVCenterVMMutationsRejectMissingConfirmationBeforeConnecting(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "hardware",
			method: http.MethodPut,
			path:   "/api/vcenter/vms/vm-101/hardware",
			body:   `{"numCpu":4}`,
			params: gin.Params{{Key: "moref", Value: "vm-101"}},
			run:    func(c *gin.Context) { handleVCenterVMHardware(c, nil) },
		},
		{
			name:   "disk expand",
			method: http.MethodPost,
			path:   "/api/vcenter/vms/vm-101/disk/expand",
			body:   `{"deviceKey":2000,"totalGiB":120}`,
			params: gin.Params{{Key: "moref", Value: "vm-101"}},
			run:    func(c *gin.Context) { handleVCenterVMDiskExpand(c, nil) },
		},
		{
			name:   "snapshot create",
			method: http.MethodPost,
			path:   "/api/vcenter/vms/vm-101/snapshots",
			body:   `{"name":"before-change"}`,
			params: gin.Params{{Key: "moref", Value: "vm-101"}},
			run:    func(c *gin.Context) { handleVCenterVMSnapshotCreate(c, nil) },
		},
		{
			name:   "snapshot revert",
			method: http.MethodPost,
			path:   "/api/vcenter/vms/vm-101/snapshots/before-change/revert",
			body:   `{}`,
			params: gin.Params{{Key: "moref", Value: "vm-101"}, {Key: "name", Value: "before-change"}},
			run:    func(c *gin.Context) { handleVCenterVMSnapshotRevert(c, nil) },
		},
		{
			name:   "snapshot delete",
			method: http.MethodDelete,
			path:   "/api/vcenter/vms/vm-101/snapshots/before-change",
			body:   ``,
			params: gin.Params{{Key: "moref", Value: "vm-101"}, {Key: "name", Value: "before-change"}},
			run:    func(c *gin.Context) { handleVCenterVMSnapshotDelete(c, nil) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newVCenterTestContext(tc.method, tc.path, tc.body, tc.params)
			tc.run(c)
			assertVCenterMissingConfirm(t, w)
		})
	}
}
