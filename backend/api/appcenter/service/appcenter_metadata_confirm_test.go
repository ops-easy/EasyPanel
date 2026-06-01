package service

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestAppCenterMetadataWritesRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	idParams := gin.Params{{Key: "id", Value: "1"}}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "redis create instance",
			method: http.MethodPost,
			path:   "/api/app-center/redis/instances",
			body:   `{"name":"redis-demo","mode":"standalone","addr":"127.0.0.1:6379"}`,
			run:    func(c *gin.Context) { handleAppRedisCreate(c, nil) },
		},
		{
			name:   "redis update instance",
			method: http.MethodPut,
			path:   "/api/app-center/redis/instances/1",
			body:   `{"name":"redis-demo","mode":"standalone","addr":"127.0.0.1:6379"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppRedisUpdate(c, nil) },
		},
		{
			name:   "redis create template",
			method: http.MethodPost,
			path:   "/api/app-center/redis/templates",
			body:   `{"name":"redis-template","config":{}}`,
			run:    func(c *gin.Context) { handleAppRedisTemplateCreate(c, nil) },
		},
		{
			name:   "redis update template",
			method: http.MethodPut,
			path:   "/api/app-center/redis/templates/1",
			body:   `{"name":"redis-template","config":{}}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppRedisTemplateUpdate(c, nil) },
		},
		{
			name:   "mysql create instance",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/instances",
			body:   `{"name":"mysql-demo","mode":"external","host":"127.0.0.1","port":3306,"username":"root","password":"secret"}`,
			run:    func(c *gin.Context) { handleAppMySQLCreate(c, nil) },
		},
		{
			name:   "mysql update instance",
			method: http.MethodPut,
			path:   "/api/app-center/mysql/instances/1",
			body:   `{"name":"mysql-demo","mode":"external","host":"127.0.0.1","port":3306,"username":"root","password":"secret"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLUpdate(c, nil) },
		},
		{
			name:   "mysql create template",
			method: http.MethodPost,
			path:   "/api/app-center/mysql/templates",
			body:   `{"name":"mysql-template","config":{}}`,
			run:    func(c *gin.Context) { handleAppMySQLTemplateCreate(c, nil) },
		},
		{
			name:   "mysql update template",
			method: http.MethodPut,
			path:   "/api/app-center/mysql/templates/1",
			body:   `{"name":"mysql-template","config":{}}`,
			params: idParams,
			run:    func(c *gin.Context) { handleAppMySQLTemplateUpdate(c, nil) },
		},
		{
			name:   "kafka create template",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/templates",
			body:   `{"name":"kafka-template","config":{}}`,
			run:    func(c *gin.Context) { handleKafkaTemplateCreate(c, nil) },
		},
		{
			name:   "kafka update template",
			method: http.MethodPut,
			path:   "/api/app-center/kafka/templates/1",
			body:   `{"name":"kafka-template","config":{}}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaTemplateUpdate(c, nil) },
		},
		{
			name:   "opensearch create template",
			method: http.MethodPost,
			path:   "/api/app-center/opensearch/templates",
			body:   `{"name":"opensearch-template","config":{}}`,
			run:    func(c *gin.Context) { handleOpenSearchTemplateCreate(c, nil) },
		},
		{
			name:   "opensearch update template",
			method: http.MethodPut,
			path:   "/api/app-center/opensearch/templates/1",
			body:   `{"name":"opensearch-template","config":{}}`,
			params: idParams,
			run:    func(c *gin.Context) { handleOpenSearchTemplateUpdate(c, nil) },
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
