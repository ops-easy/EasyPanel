package core

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func newK8sMutationTestContext(method, path, body string, params gin.Params) (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = params
	c.Request = httptest.NewRequest(method, path, strings.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	return c, w
}

func assertK8sMissingConfirm(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s, want %d", w.Code, w.Body.String(), http.StatusBadRequest)
	}
	if !strings.Contains(strings.ToLower(w.Body.String()), "confirm") {
		t.Fatalf("response should mention confirm requirement, got %s", w.Body.String())
	}
}

func runK8sMutationHandler(t *testing.T, run func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("handler panicked before rejecting missing confirmation: %v", r)
		}
	}()
	run()
}

func TestK8sMutationsRejectMissingConfirmationBeforeClusterAccess(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "apply yaml",
			method: http.MethodPost,
			path:   "/api/k8s/apply-yaml",
			body:   `{"yamlContent":"apiVersion: v1\nkind: ConfigMap\nmetadata:\n  namespace: default\n  name: demo\n"}`,
			run:    func(c *gin.Context) { handleK8sApplyYamlGeneric(c, nil) },
		},
		{
			name:   "object json",
			method: http.MethodPut,
			path:   "/api/k8s/object-json",
			body:   `{"kind":"ConfigMap","object":{"metadata":{"namespace":"default","name":"demo"}}}`,
			run:    func(c *gin.Context) { handleK8sPutObjectJSON(c, nil) },
		},
		{
			name:   "revision rollback",
			method: http.MethodPost,
			path:   "/api/k8s/object-revisions/rollback",
			body:   `{"namespace":"default","kind":"ConfigMap","name":"demo","revisionId":"rev-1"}`,
			run:    func(c *gin.Context) { handleK8sObjectRevisionRollback(c, nil) },
		},
		{
			name:   "delete object",
			method: http.MethodDelete,
			path:   "/api/k8s/objects/configmap/default/demo",
			params: gin.Params{{Key: "kind", Value: "configmap"}, {Key: "namespace", Value: "default"}, {Key: "name", Value: "demo"}},
			run:    func(c *gin.Context) { handleK8sDeleteObject(c, nil) },
		},
		{
			name:   "deployment restart",
			method: http.MethodPost,
			path:   "/api/k8s/deployments/default/demo/restart",
			params: gin.Params{{Key: "namespace", Value: "default"}, {Key: "name", Value: "demo"}},
			run:    func(c *gin.Context) { handleK8sDeploymentRolloutRestart(c, nil) },
		},
		{
			name:   "legacy ingress yaml",
			method: http.MethodPost,
			path:   "/api/ingress/yaml",
			body:   `{"yamlContent":"apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  namespace: default\n  name: demo\n"}`,
			run:    func(c *gin.Context) { handleApplyYaml(c, nil) },
		},
		{
			name:   "legacy ingress delete",
			method: http.MethodPost,
			path:   "/api/ingress/delete",
			body:   `{"namespace":"default","name":"demo","domain":"demo.example.com"}`,
			run:    func(c *gin.Context) { handleDeleteIngress(c, nil, Config{}) },
		},
		{
			name:   "direct pod delete",
			method: http.MethodDelete,
			path:   "/api/k8s/pods/default/demo",
			params: gin.Params{{Key: "namespace", Value: "default"}, {Key: "name", Value: "demo"}},
			run:    func(c *gin.Context) { handleK8sPodDelete(c, nil) },
		},
		{
			name:   "pvc expand",
			method: http.MethodPost,
			path:   "/api/k8s/pvcs/default/data/expand",
			body:   `{"size":"50Gi"}`,
			params: gin.Params{{Key: "namespace", Value: "default"}, {Key: "name", Value: "data"}},
			run:    func(c *gin.Context) { handleK8sPVCExpand(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newK8sMutationTestContext(tc.method, tc.path, tc.body, tc.params)
			runK8sMutationHandler(t, func() { tc.run(c) })
			assertK8sMissingConfirm(t, w)
		})
	}
}
