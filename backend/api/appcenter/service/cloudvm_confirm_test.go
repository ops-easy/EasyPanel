package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	core "github.com/ops-easy/EasyPanel/backend/common/core"
	transportauthz "github.com/ops-easy/EasyPanel/backend/common/transport/authz"

	"github.com/gin-gonic/gin"
)

func newCloudVMMutationTestContext(method, path, body string) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "id", Value: "1"}}
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleAdmin)
	core.SetDashboardPermissionsGin(c, &core.EffectiveDashboardPermissions{
		AppCenter:                      core.ModuleAccessRW,
		AppCenterRedis:                 core.AppCenterRedisScopeFull,
		AppCenterCloudVm:               core.AppCenterRedisScopeFull,
		AppCenterCloudVmHysteriaReveal: true,
	})
	return c, w
}

func assertCloudVMMissingConfirm(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s, want %d", w.Code, w.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func runCloudVMMutationHandler(t *testing.T, run func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panicked before rejecting missing confirmation: %v", r)
		}
	}()
	run()
}

func TestCloudVMMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		run    func(*gin.Context)
	}{
		{
			name:   "create instance",
			method: http.MethodPost,
			path:   "/api/app-center/cloud-vm/instances",
			body:   `{"name":"demo","imageId":"ubuntu","rootPassword":"supersecret"}`,
			run:    func(c *gin.Context) { handleCloudVMCreate(c, nil) },
		},
		{
			name:   "update config",
			method: http.MethodPut,
			path:   "/api/app-center/cloud-vm/instances/1",
			body:   `{"initScript":"echo hi"}`,
			run:    func(c *gin.Context) { handleCloudVMUpdatePut(c, nil) },
		},
		{
			name:   "sync root password",
			method: http.MethodPut,
			path:   "/api/app-center/cloud-vm/instances/1",
			body:   `{"rootPassword":"supersecret"}`,
			run:    func(c *gin.Context) { handleCloudVMUpdatePut(c, nil) },
		},
		{
			name:   "scale resources",
			method: http.MethodPost,
			path:   "/api/app-center/cloud-vm/instances/1/scale",
			body:   `{"cpuRequest":"100m"}`,
			run:    func(c *gin.Context) { handleCloudVMScale(c, nil) },
		},
		{
			name:   "delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/cloud-vm/instances/1",
			run:    func(c *gin.Context) { handleCloudVMDelete(c, nil) },
		},
		{
			name:   "reset root password",
			method: http.MethodPost,
			path:   "/api/app-center/cloud-vm/instances/1/reset-root-password",
			body:   `{}`,
			run:    func(c *gin.Context) { handleCloudVMResetRootPassword(c, nil) },
		},
		{
			name:   "reveal hysteria client",
			method: http.MethodPost,
			path:   "/api/app-center/cloud-vm/instances/1/reveal-hysteria-client",
			body:   `{"password":"current-password"}`,
			run:    func(c *gin.Context) { handleCloudVMRevealHysteriaClient(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newCloudVMMutationTestContext(tc.method, tc.path, tc.body)
			runCloudVMMutationHandler(t, func() { tc.run(c) })
			assertCloudVMMissingConfirm(t, w)
		})
	}
}
