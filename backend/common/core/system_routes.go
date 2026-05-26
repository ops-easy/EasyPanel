package core

import "github.com/gin-gonic/gin"

func RegisterSystemPublicRoutes(r *gin.Engine, app *ServerApp) {
	r.GET("/api/health", handleHealth(app))
	r.GET("/api/setup/status", handleSetupStatus(app))
	r.POST("/api/setup", handleSetupSave(app))
	r.GET("/api/auth/status", func(c *gin.Context) { handleAuthStatus(c, app) })
	r.GET("/api/auth/login-challenge", handleAuthLoginChallenge(app))
	r.GET("/api/login/public-status", handleLoginPublicStatus(app))
	r.POST("/api/auth/login", func(c *gin.Context) { handleAuthLogin(c, app) })
	r.POST("/api/auth/login-totp", handleAuthLoginTotp(app))
	r.GET("/api/auth/totp/setup-provision", handleTotpSetupProvision(app))
	r.POST("/api/auth/totp/setup-verify", handleTotpSetupVerify(app))
	r.POST("/api/auth/logout", func(c *gin.Context) { handleAuthLogout(c, app) })
	r.GET("/api/auth/oidc/login", handleOIDCLogin(app))
	r.GET("/api/auth/oidc/callback", handleOIDCCallback(app))
}

func RegisterSystemProtectedRoutes(api *gin.RouterGroup, app *ServerApp) {
	api.GET("/audit/logs", AdminOnlyMiddleware(app), handleGetAuditLogs(app))
	api.GET("/audit/summary", AdminOnlyMiddleware(app), handleGetAuditSummary(app))
	api.GET("/audit/site-stats", AdminOnlyMiddleware(app), handleGetSiteStats(app))
	api.GET("/audit/harbor-dashboard", AdminOnlyMiddleware(app), handleGetHarborAdminDashboard(app))
	api.GET("/account/oidc/bind/start", handleOIDCBindStart(app))
	api.GET("/host/egress-notification", handleHostEgressNotification(app))
	api.POST("/host/egress-notification/read", handleHostEgressNotificationRead(app))
	api.POST("/host/security-login-alert/read", handleSecurityLoginAlertRead(app))
	api.POST("/host/remote-login-alert/read", handleRemoteLoginAlertRead(app))
	api.POST("/host/admin-ip-ban-alert/read", handleAdminIpBanAlertRead(app))

	registerAdminUserRoutes(api, app)
	registerAccountProfileRoutes(api, app)
}
