package middleware

import (
	core "github.com/ops-easy/EasyPanel/backend/common/core"

	"github.com/gin-gonic/gin"
)

func AdminOnly(app *core.ServerApp) gin.HandlerFunc {
	return core.AdminOnlyMiddleware(app)
}
