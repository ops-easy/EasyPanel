package core

import (
	"github.com/ops-easy/EasyPanel/backend/common/transport/httpx"

	"github.com/gin-gonic/gin"
)

// APIErrorPermissionDenied 与前端约定：403 权限类错误统一展示该文案，不在 JSON 中泄露具体策略细节。
const APIErrorPermissionDenied = httpx.APIErrorPermissionDenied

// RespondAPIPermissionDenied 返回 403 {"error": APIErrorPermissionDenied}（非 Abort 场景）。
func RespondAPIPermissionDenied(c *gin.Context) {
	httpx.RespondPermissionDenied(c)
}

// AbortAPIPermissionDenied 中止中间件链并返回 403 权限错误。
func AbortAPIPermissionDenied(c *gin.Context) {
	httpx.AbortPermissionDenied(c)
}

// RespondAPIError 统一 JSON 错误体 {"error": msg}（与前端 ApiHttpError 约定一致）。
func RespondAPIError(c *gin.Context, status int, msg string) {
	httpx.RespondError(c, status, msg)
}

// RespondAPIError500 等价于 RespondAPIError(c, http.StatusInternalServerError, msg)。
func RespondAPIError500(c *gin.Context, msg string) {
	httpx.RespondError500(c, msg)
}

// AbortAPIError 中止中间件链并返回统一错误 JSON（用于 DashboardAuthMiddleware 等）。
func AbortAPIError(c *gin.Context, status int, msg string) {
	httpx.AbortError(c, status, msg)
}

// RespondAPIErrorMerged 先写入 "error": msg，再合并 extra 中的其它键（extra 中的 "error" 会被忽略）。
func RespondAPIErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	httpx.RespondErrorMerged(c, status, msg, extra)
}
