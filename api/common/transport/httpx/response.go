package httpx

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// APIErrorPermissionDenied 与前端约定：403 权限类错误统一展示该文案，不在 JSON 中泄露具体策略细节。
const APIErrorPermissionDenied = "权限错误"

// RespondPermissionDenied 返回 403 {"error": APIErrorPermissionDenied}（非 Abort 场景）。
func RespondPermissionDenied(c *gin.Context) {
	RespondError(c, http.StatusForbidden, APIErrorPermissionDenied)
}

// AbortPermissionDenied 中止中间件链并返回 403 权限错误。
func AbortPermissionDenied(c *gin.Context) {
	AbortError(c, http.StatusForbidden, APIErrorPermissionDenied)
}

// RespondError 统一 JSON 错误体 {"error": msg}（与前端 ApiHttpError 约定一致）。
func RespondError(c *gin.Context, status int, msg string) {
	c.JSON(status, gin.H{"error": msg})
}

// RespondError500 等价于 RespondError(c, http.StatusInternalServerError, msg)。
func RespondError500(c *gin.Context, msg string) {
	RespondError(c, http.StatusInternalServerError, msg)
}

// AbortError 中止中间件链并返回统一错误 JSON（用于 DashboardAuthMiddleware 等）。
func AbortError(c *gin.Context, status int, msg string) {
	c.AbortWithStatusJSON(status, gin.H{"error": msg})
}

// RespondErrorMerged 先写入 "error": msg，再合并 extra 中的其它键（extra 中的 "error" 会被忽略）。
func RespondErrorMerged(c *gin.Context, status int, msg string, extra gin.H) {
	h := gin.H{"error": msg}
	for k, v := range extra {
		if k == "error" {
			continue
		}
		h[k] = v
	}
	c.JSON(status, h)
}
