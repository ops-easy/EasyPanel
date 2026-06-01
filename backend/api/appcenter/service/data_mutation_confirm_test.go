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

func newAppCenterMutationTestContext(method, path, body string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = params
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	c.Set(transportauthz.GinKeyDashboardRole, core.DashboardRoleAdmin)
	return c, w
}

func assertAppCenterMissingConfirm(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s, want %d", w.Code, w.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm=true") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func runAppCenterMutationHandler(t *testing.T, run func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panicked before rejecting missing confirmation: %v", r)
		}
	}()
	run()
}

func TestAppCenterDataMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	idParams := gin.Params{{Key: "id", Value: "1"}}
	userParams := gin.Params{{Key: "id", Value: "1"}, {Key: "user", Value: "demo"}}
	backupParams := gin.Params{{Key: "id", Value: "1"}, {Key: "backupId", Value: "2"}}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "mysql delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/mysql/instances/1",
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLDelete(c, nil) },
		},
		{
			name:   "mysql change user password",
			method: http.MethodPut,
			path:   "/api/app-center/mysql/instances/1/users/demo/password",
			body:   `{"host":"%","password":"supersecret"}`,
			params: userParams,
			run:    func(c *gin.Context) { handleAppMySQLUserPassword(c, nil) },
		},
		{
			name:   "mysql delete user",
			method: http.MethodDelete,
			path:   "/api/app-center/mysql/instances/1/users/demo?host=%",
			params: userParams,
			run:    func(c *gin.Context) { handleAppMySQLUserDelete(c, nil) },
		},
		{
			name:   "mysql create user",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances/1/users",
			body:   `{"username":"demo","host":"%","password":"supersecret","schema":"app","role":"readwrite"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLUserCreate(c, nil) },
		},
		{
			name:   "mysql create backup",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances/1/backups",
			body:   `{"schema":"app","backupName":"app-20260529.sql"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLBackupCreate(c, nil) },
		},
		{
			name:   "mysql mutation sql",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances/1/query",
			body:   `{"sql":"delete from demo where id=1","schema":"app","confirmMutation":true}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLQuery(c, nil) },
		},
		{
			name:   "mysql restore backup",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances/1/backups/2/restore",
			body:   `{"targetSchema":"app"}`,
			params: backupParams,
			run:    func(c *gin.Context) { handleAppMySQLBackupRestore(c, nil) },
		},
		{
			name:   "mysql delete backup",
			method: http.MethodDelete,
			path:   "/api/app-center/mysql/instances/1/backups/2",
			params: backupParams,
			run:    func(c *gin.Context) { handleAppMySQLBackupDelete(c, nil) },
		},
		{
			name:   "redis delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/redis/instances/1",
			params: idParams,
			run:    func(c *gin.Context) { handleAppRedisDelete(c, nil) },
		},
		{
			name:   "redis delete keys",
			method: http.MethodPost,
			path:   "/api/app-center/redis/instances/1/keys/delete",
			body:   `{"keys":["demo"]}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppRedisKeysDelete(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newAppCenterMutationTestContext(tc.method, tc.path, tc.body, tc.params)
			runAppCenterMutationHandler(t, func() { tc.run(c) })
			assertAppCenterMissingConfirm(t, w)
		})
	}
}
