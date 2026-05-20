package audit

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const GinDetailKey = "kubebt_audit_detail"

func SetDetail(c *gin.Context, detail string) {
	if c == nil {
		return
	}
	s := strings.TrimSpace(detail)
	if s == "" {
		return
	}
	c.Set(GinDetailKey, s)
}
