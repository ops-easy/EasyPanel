package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestDNSMutationConfirmMiddlewareRejectsBeforeHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	r := gin.New()
	r.POST("/write", dnsMutationConfirmMiddleware("dns write"), func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/write", strings.NewReader(`{"name":"example"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if called {
		t.Fatalf("handler should not be called without explicit confirmation")
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func TestDNSMutationConfirmMiddlewareRestoresBodyAfterConfirmation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/write", dnsMutationConfirmMiddleware("dns write"), func(c *gin.Context) {
		var body struct {
			Name    string `json:"name"`
			Confirm bool   `json:"confirm"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			t.Fatalf("body was not restored for handler bind: %v", err)
		}
		if body.Name != "example" || !body.Confirm {
			t.Fatalf("body = %#v", body)
		}
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/write", bytes.NewReader([]byte(`{"name":"example","confirm":true}`)))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d; body=%s", w.Code, http.StatusNoContent, w.Body.String())
	}
}

func TestDNSMutationConfirmMiddlewareAcceptsQueryConfirmation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	called := false
	r := gin.New()
	r.DELETE("/write", dnsMutationConfirmMiddleware("dns write"), func(c *gin.Context) {
		called = true
		c.Status(http.StatusNoContent)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodDelete, "/write?confirm=true", nil)
	r.ServeHTTP(w, req)

	if !called {
		t.Fatalf("handler should be called when query carries confirm=true")
	}
	if w.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusNoContent)
	}
}
