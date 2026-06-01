package service

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newBaotaMutationTestContext(method, path, body string) (*gin.Context, *httptest.ResponseRecorder) {
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
	return c, w
}

func TestBaotaIngressSyncRunRejectsMissingConfirmationBeforeResourceAccess(t *testing.T) {
	c, w := newBaotaMutationTestContext(http.MethodPost, "/api/baota/ingress-sync/run", `{}`)

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panicked before rejecting missing confirmation: %v", r)
		}
	}()
	IngressSyncRun(nil)(c)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body=%s", w.Code, http.StatusBadRequest, w.Body.String())
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}
