package result

import (
	core "github.com/ops-easy/EasyPanel/api/common/core"
	"github.com/ops-easy/EasyPanel/api/common/transport/httpx"

	"github.com/gin-gonic/gin"
)

const APIErrorPermissionDenied = httpx.APIErrorPermissionDenied

func PermissionDenied(c *gin.Context) {
	core.RespondAPIPermissionDenied(c)
}

func Error500(c *gin.Context, msg string) {
	core.RespondAPIError500(c, msg)
}

func ErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	core.RespondAPIErrorMerged(c, status, msg, extra)
}
