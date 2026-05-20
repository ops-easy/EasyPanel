package internal

import "github.com/gin-gonic/gin"

func RegisterOpsPublicRoutes(r *gin.Engine, app *ServerApp) {
	r.POST("/api/hooks/alertmanager", handleAlertmanagerWebhook(app))
}

func RegisterOpsCenterRoutes(api *gin.RouterGroup, app *ServerApp) {
	registerOpsCenterRoutes(api, app)
}
