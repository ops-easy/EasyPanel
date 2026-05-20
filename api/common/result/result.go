package result

import (
	core "kube-bt-sync/common/core"

	"github.com/gin-gonic/gin"
)

func PermissionDenied(c *gin.Context) {
	core.RespondAPIPermissionDenied(c)
}

func Error500(c *gin.Context, msg string) {
	core.RespondAPIError500(c, msg)
}

func ErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	core.RespondAPIErrorMerged(c, status, msg, extra)
}
