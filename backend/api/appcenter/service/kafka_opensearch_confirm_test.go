package service

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestKafkaAndOpenSearchMutationsRejectMissingConfirmationBeforeResourceAccess(t *testing.T) {
	idParams := gin.Params{{Key: "id", Value: "1"}}
	topicParams := gin.Params{{Key: "id", Value: "1"}, {Key: "topic", Value: "orders"}}
	topicSplatParams := gin.Params{{Key: "id", Value: "1"}, {Key: "topic", Value: "/orders"}}
	userParams := gin.Params{{Key: "id", Value: "1"}, {Key: "user", Value: "/alice"}}
	jobParams := gin.Params{{Key: "id", Value: "1"}, {Key: "name", Value: "kafka-perf-1"}}

	cases := []struct {
		name   string
		method string
		path   string
		body   string
		params gin.Params
		run    func(*gin.Context)
	}{
		{
			name:   "kafka delete template",
			method: http.MethodDelete,
			path:   "/api/app-center/kafka/templates/1",
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaTemplateDelete(c, nil) },
		},
		{
			name:   "kafka update exposure",
			method: http.MethodPut,
			path:   "/api/app-center/kafka/instances/1/exposure",
			body:   `{"mode":"nodeport","advertiseHost":"10.0.0.10","nodePorts":[30092,30093,30094]}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaInstanceExposurePut(c, nil) },
		},
		{
			name:   "kafka delete topic",
			method: http.MethodDelete,
			path:   "/api/app-center/kafka/instances/1/topics/orders",
			params: topicSplatParams,
			run:    func(c *gin.Context) { handleKafkaTopicDelete(c, nil) },
		},
		{
			name:   "kafka create topic",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/topics",
			body:   `{"topic":"orders","partitions":3,"replicationFactor":3}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaTopicCreate(c, nil) },
		},
		{
			name:   "kafka create acl",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/acls",
			body:   `{"resourceType":"topic","resourceName":"orders","resourcePatternType":"literal","principal":"User:alice","host":"*","operation":"read","permissionType":"allow"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaACLCreate(c, nil) },
		},
		{
			name:   "kafka delete acl",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/acls/delete",
			body:   `{"resourceType":"topic","resourcePatternType":"literal","operation":"read","permissionType":"allow"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaACLDelete(c, nil) },
		},
		{
			name:   "kafka create scram user",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/scram-users",
			body:   `{"username":"alice","password":"supersecret"}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaScramUserCreate(c, nil) },
		},
		{
			name:   "kafka delete scram user",
			method: http.MethodDelete,
			path:   "/api/app-center/kafka/instances/1/scram-users/alice",
			params: userParams,
			run:    func(c *gin.Context) { handleKafkaScramUserDelete(c, nil) },
		},
		{
			name:   "kafka delete instance",
			method: http.MethodDelete,
			path:   "/api/app-center/kafka/instances/1",
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaInstanceDelete(c, nil) },
		},
		{
			name:   "kafka update topic configs",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/topics/orders/configs",
			body:   `{"entries":{"retention.ms":"60000"}}`,
			params: topicParams,
			run:    func(c *gin.Context) { handleKafkaTopicConfigsPost(c, nil) },
		},
		{
			name:   "kafka produce message",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/topics/orders/messages",
			body:   `{"value":"hello"}`,
			params: topicParams,
			run:    func(c *gin.Context) { handleKafkaTopicProduce(c, nil) },
		},
		{
			name:   "kafka set client quota",
			method: http.MethodPut,
			path:   "/api/app-center/kafka/instances/1/quotas",
			body:   `{"user":"alice","producerByteRate":1024,"consumerByteRate":2048}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaClientQuotaSet(c, nil) },
		},
		{
			name:   "kafka set topic throttle",
			method: http.MethodPut,
			path:   "/api/app-center/kafka/instances/1/topics/orders/throttle",
			body:   `{"leaderReplicationThrottledRate":1024,"followerReplicationThrottledRate":2048}`,
			params: topicParams,
			run:    func(c *gin.Context) { handleKafkaTopicThrottlePut(c, nil) },
		},
		{
			name:   "kafka start perf test",
			method: http.MethodPost,
			path:   "/api/app-center/kafka/instances/1/perf-test",
			body:   `{"topic":"orders","messages":1000}`,
			params: idParams,
			run:    func(c *gin.Context) { handleKafkaPerfTestStart(c, nil) },
		},
		{
			name:   "kafka delete perf test",
			method: http.MethodDelete,
			path:   "/api/app-center/kafka/instances/1/perf-tests/kafka-perf-1",
			params: jobParams,
			run:    func(c *gin.Context) { handleKafkaPerfTestDelete(c, nil) },
		},
		{
			name:   "opensearch delete index",
			method: http.MethodDelete,
			path:   "/api/app-center/opensearch/instances/1/index?index=logs",
			params: idParams,
			run:    func(c *gin.Context) { handleOpenSearchIndexDelete(c, nil) },
		},
		{
			name:   "opensearch update index settings",
			method: http.MethodPut,
			path:   "/api/app-center/opensearch/instances/1/index/settings?index=logs",
			body:   `{"index":{"refresh_interval":"30s"}}`,
			params: idParams,
			run:    func(c *gin.Context) { handleOpenSearchIndexSettings(c, nil) },
		},
		{
			name:   "opensearch prune indices",
			method: http.MethodPost,
			path:   "/api/app-center/opensearch/instances/1/indices/prune",
			body:   `{"pattern":"logs-*","olderThanDays":7,"dryRun":false}`,
			params: idParams,
			run:    func(c *gin.Context) { handleOpenSearchIndicesPrune(c, nil) },
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
