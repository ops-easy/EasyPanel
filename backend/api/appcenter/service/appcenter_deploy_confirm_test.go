package service

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppCenterK8sDeployMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	cases := []struct {
		name string
		path string
		body string
		run  func(*gin.Context)
	}{
		{
			name: "redis k8s deploy",
			path: "/api/app-center/redis/k8s-deploy",
			body: `{"namespace":"apps","deploymentName":"redis"}`,
			run:  func(c *gin.Context) { handleAppRedisK8sDeploy(c, nil) },
		},
		{
			name: "mysql k8s deploy",
			path: "/api/app-center/mysql/k8s-deploy",
			body: `{"namespace":"apps","baseName":"mysql"}`,
			run:  func(c *gin.Context) { handleAppMySQLK8sDeploy(c, nil) },
		},
		{
			name: "kafka k8s deploy",
			path: "/api/app-center/kafka/k8s-deploy",
			body: `{"namespace":"apps","baseName":"kafka","templateId":1}`,
			run:  func(c *gin.Context) { handleKafkaK8sDeploy(c, nil) },
		},
		{
			name: "opensearch k8s deploy",
			path: "/api/app-center/opensearch/k8s-deploy",
			body: `{"namespace":"apps","deploymentName":"opensearch"}`,
			run:  func(c *gin.Context) { handleOpenSearchK8sDeploy(c, nil) },
		},
		{
			name: "hermes k8s deploy",
			path: "/api/app-center/hermes/k8s-deploy",
			body: `{"namespace":"apps","deploymentName":"hermes","mode":"gateway"}`,
			run:  func(c *gin.Context) { handleAppHermesDeploy(c, nil) },
		},
		{
			name: "openclaw k8s deploy",
			path: "/api/app-center/openclaw/k8s-deploy",
			body: `{"namespace":"apps","deploymentName":"openclaw"}`,
			run:  func(c *gin.Context) { handleAppOpenClawK8sDeploy(c, nil) },
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, w := newAppCenterMutationTestContext(http.MethodPost, tc.path, tc.body, gin.Params{})
			runAppCenterMutationHandler(t, func() { tc.run(c) })
			assertAppCenterMissingConfirm(t, w)
		})
	}
}
