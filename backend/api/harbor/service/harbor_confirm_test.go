package service

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newHarborMutationTestContext(method, path, body string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	var r *http.Request
	if body == "" {
		r = httptest.NewRequest(method, path, nil)
	} else {
		r = httptest.NewRequest(method, path, bytes.NewReader([]byte(body)))
		r.Header.Set("Content-Type", "application/json")
	}
	c, _ := gin.CreateTestContext(w)
	c.Request = r
	c.Params = params
	return c, w
}

func runHarborMutationHandler(t *testing.T, run func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panicked before rejecting missing confirmation: %v", r)
		}
	}()
	run()
}

func TestHarborMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "manual image index sync",
			method: http.MethodPost,
			path:   "/api/harbor/index/sync",
			body:   `{}`,
			run: func(c *gin.Context) {
				HandleHarborIndexSync(nil)(c)
			},
		},
		{
			name:   "artifact delete",
			method: http.MethodDelete,
			path:   "/api/harbor/projects/library/artifacts?repository=nginx&reference=sha256:demo",
			params: gin.Params{{Key: "project", Value: "library"}},
			run: func(c *gin.Context) {
				HandleHarborDeleteArtifact(nil)(c)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newHarborMutationTestContext(tc.method, tc.path, tc.body, tc.params)
			runHarborMutationHandler(t, func() { tc.run(c) })
			if w.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", w.Code, http.StatusBadRequest, w.Body.String())
			}
			if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
				t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
			}
		})
	}
}
