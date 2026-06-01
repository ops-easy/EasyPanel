package core

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ops-easy/EasyPanel/backend/common/transport/authz"

	"github.com/gin-gonic/gin"
)

func newConfirmTestContext(method, path, body string) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c, w
}

func assertConfirmRequired(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s, want %d", w.Code, w.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func TestPrometheusSourceRejectsMissingConfirmationBeforeMutation(t *testing.T) {
	c, w := newConfirmTestContext(http.MethodPost, "/api/prometheus/source", `{"baseUrl":"https://prom.example","scope":"k8s"}`)

	handlePrometheusSource(c, Config{})

	assertConfirmRequired(t, w)
}

func TestDocsAttachmentStorageRejectsMissingConfirmationBeforeKVLookup(t *testing.T) {
	c, w := newConfirmTestContext(http.MethodPut, "/api/docs/attachment-storage", `{"secretId":"AKID","secretKey":"secret","bucket":"bucket-123","region":"ap-guangzhou"}`)

	docsAttachmentStoragePut(c, nil)

	assertConfirmRequired(t, w)
}

func TestDocsAttachmentStorageClearRejectsMissingConfirmationBeforeKVLookup(t *testing.T) {
	c, w := newConfirmTestContext(http.MethodDelete, "/api/docs/attachment-storage/cos", ``)

	docsAttachmentStorageClearCosKV(c, nil)

	assertConfirmRequired(t, w)
}

func TestDocsDestructiveMutationsRejectMissingConfirmationBeforeStoreLookup(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "doc delete",
			method: http.MethodDelete,
			path:   "/api/docs/42",
			params: gin.Params{{Key: "id", Value: "42"}},
			run:    func(c *gin.Context) { docsDelete(c, nil) },
		},
		{
			name:   "doc create published",
			method: http.MethodPost,
			path:   "/api/docs",
			body:   `{"title":"public doc","bodyMarkdown":"hello","published":true}`,
			run:    func(c *gin.Context) { docsCreate(c, nil) },
		},
		{
			name:   "doc share password update",
			method: http.MethodPut,
			path:   "/api/docs/42",
			body:   `{"title":"doc","bodyMarkdown":"hello","published":false,"newSharePassword":"secret-pass"}`,
			params: gin.Params{{Key: "id", Value: "42"}},
			run:    func(c *gin.Context) { docsUpdate(c, nil) },
		},
		{
			name:   "doc version restore",
			method: http.MethodPost,
			path:   "/api/docs/42/restore-version",
			body:   `{"versionNo":1}`,
			params: gin.Params{{Key: "id", Value: "42"}},
			run:    func(c *gin.Context) { docsRestoreVersion(c, nil) },
		},
		{
			name:   "doc media delete",
			method: http.MethodDelete,
			path:   "/api/docs/media/7",
			params: gin.Params{{Key: "id", Value: "7"}},
			run:    func(c *gin.Context) { docsMediaDelete(c, nil) },
		},
		{
			name:   "doc guide delete",
			method: http.MethodDelete,
			path:   "/api/docs/guides/cluster.settings",
			params: gin.Params{{Key: "guideKey", Value: "cluster.settings"}},
			run:    func(c *gin.Context) { docsGuidesDelete(c, nil) },
		},
		{
			name:   "doc guide create",
			method: http.MethodPost,
			path:   "/api/docs/guides",
			body:   `{"guideKey":"cluster.settings","routePattern":"/cluster/settings","matchType":"prefix","docId":1}`,
			run:    func(c *gin.Context) { docsGuidesCreate(c, nil) },
		},
		{
			name:   "doc guide update",
			method: http.MethodPut,
			path:   "/api/docs/guides/cluster.settings",
			body:   `{"docId":1,"routePattern":"/cluster/settings","matchType":"prefix"}`,
			params: gin.Params{{Key: "guideKey", Value: "cluster.settings"}},
			run:    func(c *gin.Context) { docsGuidesUpdate(c, nil) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newConfirmTestContext(tc.method, tc.path, tc.body)
			c.Params = tc.params
			tc.run(c)
			assertConfirmRequired(t, w)
		})
	}
}

func TestK8sRestartAIReportMutationsRejectMissingConfirmationBeforeDBLookup(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "report save",
			method: http.MethodPost,
			path:   "/api/k8s/pod-restart-ai/reports",
			body:   `{"kind":"pod_analysis","namespace":"default","pod":"api-0","title":"restart","body":"analysis"}`,
			run:    func(c *gin.Context) { handleK8sPodRestartAIReportSave(c, &ServerApp{}) },
		},
		{
			name:   "report delete",
			method: http.MethodDelete,
			path:   "/api/k8s/pod-restart-ai/reports/1",
			params: gin.Params{{Key: "id", Value: "1"}},
			run:    func(c *gin.Context) { handleK8sPodRestartAIReportDelete(c, &ServerApp{}) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newConfirmTestContext(tc.method, tc.path, tc.body)
			c.Params = tc.params
			tc.run(c)
			assertConfirmRequired(t, w)
		})
	}
}

func TestAccountMutationsRejectMissingConfirmationBeforeStoreLookup(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		user   string
		run    func(*gin.Context)
	}{
		{
			name:   "admin user create",
			method: http.MethodPost,
			path:   "/api/admin/users",
			body:   `{"username":"alice","password":"secret-pass","role":"viewer"}`,
			run:    func(c *gin.Context) { handleAdminUsersCreate(c, nil) },
		},
		{
			name:   "admin user update",
			method: http.MethodPut,
			path:   "/api/admin/users/1",
			body:   `{"email":"alice@example.com"}`,
			params: gin.Params{{Key: "id", Value: "1"}},
			run:    func(c *gin.Context) { handleAdminUsersUpdate(c, nil) },
		},
		{
			name:   "admin user delete",
			method: http.MethodDelete,
			path:   "/api/admin/users/1",
			params: gin.Params{{Key: "id", Value: "1"}},
			run:    func(c *gin.Context) { handleAdminUsersDelete(c, nil) },
		},
		{
			name:   "admin user OIDC unbind",
			method: http.MethodPost,
			path:   "/api/admin/users/oidc/unbind",
			body:   `{"username":"alice","operatorPassword":"secret-pass"}`,
			run:    func(c *gin.Context) { handleAdminUserOIDCUnbind(c, nil) },
		},
		{
			name:   "admin user TOTP provision",
			method: http.MethodPost,
			path:   "/api/admin/users/totp/provision",
			body:   `{"username":"alice","currentPassword":"secret-pass"}`,
			run:    func(c *gin.Context) { handleAdminUserTotpProvision(c, nil) },
		},
		{
			name:   "admin user TOTP disable",
			method: http.MethodPost,
			path:   "/api/admin/users/totp/disable",
			body:   `{"username":"alice","currentPassword":"secret-pass"}`,
			run:    func(c *gin.Context) { handleAdminUserTotpDisable(c, nil) },
		},
		{
			name:   "self profile update",
			method: http.MethodPut,
			path:   "/api/account/profile",
			body:   `{"email":"me@example.com"}`,
			user:   "alice",
			run:    func(c *gin.Context) { handlePutAccountProfile(c, nil) },
		},
		{
			name:   "self OIDC unbind",
			method: http.MethodPost,
			path:   "/api/account/profile/oidc/unbind",
			body:   `{"currentPassword":"secret-pass"}`,
			user:   "alice",
			run:    func(c *gin.Context) { handlePostAccountProfileOIDCUnbind(c, nil) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newConfirmTestContext(tc.method, tc.path, tc.body)
			c.Params = tc.params
			if tc.user != "" {
				c.Set(authz.GinKeyDashboardUser, tc.user)
			}
			tc.run(c)
			assertConfirmRequired(t, w)
		})
	}
}

func TestHostAndBastionMutationsRejectMissingConfirmationBeforeStoreLookup(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		role   string
		run    func(*gin.Context)
	}{
		{
			name:   "vCenter VM SSH settings update",
			method: http.MethodPut,
			path:   "/api/vcenter/vms/vm-101/ssh-settings",
			body:   `{"user":"root"}`,
			params: gin.Params{{Key: "moref", Value: "vm-101"}},
			run:    func(c *gin.Context) { handlePutVCenterVMSSHSettings(c, Config{}, nil) },
		},
		{
			name:   "vCenter VM SSH settings delete",
			method: http.MethodDelete,
			path:   "/api/vcenter/vms/vm-101/ssh-settings",
			params: gin.Params{{Key: "moref", Value: "vm-101"}},
			run:    func(c *gin.Context) { handleDeleteVCenterVMSSHSettings(c, Config{}, nil) },
		},
		{
			name:   "cloud host SSH settings update",
			method: http.MethodPut,
			path:   "/api/cloud-hosts/host-1/ssh-settings",
			body:   `{"user":"root"}`,
			params: gin.Params{{Key: "id", Value: "host-1"}},
			run:    func(c *gin.Context) { handlePutCloudHostSSHSettings(c, nil) },
		},
		{
			name:   "cloud host SSH settings delete",
			method: http.MethodDelete,
			path:   "/api/cloud-hosts/host-1/ssh-settings",
			params: gin.Params{{Key: "id", Value: "host-1"}},
			run:    func(c *gin.Context) { handleDeleteCloudHostSSHSettings(c, nil) },
		},
		{
			name:   "bastion target SSH settings update",
			method: http.MethodPut,
			path:   "/api/bastion/targets/ssh-settings?target=vcenter:vm-101",
			body:   `{"user":"root"}`,
			run:    func(c *gin.Context) { handlePutBastionTargetSSHSettings(c, nil) },
		},
		{
			name:   "bastion target SSH settings delete",
			method: http.MethodDelete,
			path:   "/api/bastion/targets/ssh-settings?target=vcenter:vm-101",
			run:    func(c *gin.Context) { handleDeleteBastionTargetSSHSettings(c, nil) },
		},
		{
			name:   "vCenter bastion policy update",
			method: http.MethodPut,
			path:   "/api/vcenter/bastion/policy",
			body:   `{"enableAcl":true,"userVms":{}}`,
			role:   DashboardRoleAdmin,
			run:    func(c *gin.Context) { handlePutVCenterBastionPolicy(c, nil) },
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newConfirmTestContext(tc.method, tc.path, tc.body)
			c.Params = tc.params
			if tc.role != "" {
				c.Set(authz.GinKeyDashboardRole, tc.role)
			}
			tc.run(c)
			assertConfirmRequired(t, w)
		})
	}
}
