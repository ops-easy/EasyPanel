package service

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppCenterPlatformConfigMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	cases := []struct {
		name string
		path string
		body string
		run  func(*gin.Context)
	}{
		{
			name: "cloud-vm bootstrap",
			path: "/api/app-center/cloud-vm/bootstrap",
			body: `{"defaultNamespace":"easypanel-cloud-vm","images":[{"id":"ubuntu","image":"ubuntu:22.04"}]}`,
			run:  func(c *gin.Context) { handleCloudVMBootstrapPut(c, nil) },
		},
		{
			name: "hermes bootstrap",
			path: "/api/app-center/hermes/bootstrap",
			body: `{"defaultNamespace":"hermes","defaultMode":"standalone","defaultImage":"ghcr.io/example/hermes:latest","defaultStorageSize":"10Gi"}`,
			run:  func(c *gin.Context) { handleAppHermesBootstrapPut(c, nil) },
		},
		{
			name: "openclaw image catalog",
			path: "/api/app-center/openclaw/image-catalog",
			body: `{"catalog":{"entries":[{"id":"stable","label":"Stable","image":"openclaw/openclaw:latest"}]}}`,
			run:  func(c *gin.Context) { handleAppOpenClawImageCatalogPut(c, nil) },
		},
		{
			name: "openclaw bootstrap",
			path: "/api/app-center/openclaw/bootstrap",
			body: `{"defaultNamespace":"openclaw","modes":[{"id":"default","label":"Default","image":"openclaw/openclaw:latest"}]}`,
			run:  func(c *gin.Context) { handleAppOpenClawBootstrapPut(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newAppCenterMutationTestContext(http.MethodPut, tc.path, tc.body, nil)
			runAppCenterMutationHandler(t, func() { tc.run(c) })
			assertAppCenterMissingConfirm(t, w)
		})
	}
}
