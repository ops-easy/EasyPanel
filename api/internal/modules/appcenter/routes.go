package appcenter

import (
	core "kube-bt-sync/internal"
	"kube-bt-sync/internal/modules/appcenter/cloudvm"
	"kube-bt-sync/internal/modules/appcenter/kafka"
	"kube-bt-sync/internal/modules/appcenter/openclaw"
	"kube-bt-sync/internal/modules/appcenter/opensearch"
	"kube-bt-sync/internal/modules/appcenter/redis"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(api *gin.RouterGroup, app *core.ServerApp) {
	redis.RegisterRoutes(api, app)
	kafka.RegisterRoutes(api, app)
	opensearch.RegisterRoutes(api, app)
	openclaw.RegisterRoutes(api, app)
	cloudvm.RegisterRoutes(api, app)
}
