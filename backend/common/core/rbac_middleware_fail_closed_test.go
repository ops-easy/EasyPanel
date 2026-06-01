package core

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestViewerRestrictionsRejectsMissingRoleWhenAuthEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	app := &ServerApp{cfg: Config{DashboardPassword: "configured"}}
	router := gin.New()
	router.Use(ViewerRestrictionsMiddleware(app))
	router.GET("/api/cloud-hosts", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })

	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/cloud-hosts", nil)
	router.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("missing dashboard role status=%d, want %d; body=%s", w.Code, http.StatusForbidden, w.Body.String())
	}
}
