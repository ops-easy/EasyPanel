package request

import (
	"kube-bt-sync/common/appctx"
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func AuditClientIP(c *gin.Context, cfg appctx.Config) string {
	return core.AuditClientIP(c, cfg)
}
