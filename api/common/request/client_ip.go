package request

import (
	"github.com/ops-easy/EasyPanel/api/common/appctx"
	core "github.com/ops-easy/EasyPanel/api/common/core"

	"github.com/gin-gonic/gin"
)

func AuditClientIP(c *gin.Context, cfg appctx.Config) string {
	return core.AuditClientIP(c, cfg)
}
