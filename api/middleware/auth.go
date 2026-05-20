package middleware

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

func AdminOnly(app *core.ServerApp) gin.HandlerFunc {
	return core.AdminOnlyMiddleware(app)
}
