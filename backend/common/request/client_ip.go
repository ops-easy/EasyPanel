package request

import (
	"github.com/ops-easy/EasyPanel/backend/common/appctx"
	core "github.com/ops-easy/EasyPanel/backend/common/core"

	"github.com/gin-gonic/gin"
)

func AuditClientIP(c *gin.Context, cfg appctx.Config) string {
	return core.AuditClientIP(c, cfg)
}
