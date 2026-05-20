package service

import (
	"kube-bt-sync/common/appctx"
	"kube-bt-sync/common/authz"
	"kube-bt-sync/common/request"

	"github.com/gin-gonic/gin"
)

type Config = appctx.Config
type RedisLight = appctx.RedisLight
type ServerApp = appctx.ServerApp

func AuditClientIP(c *gin.Context, cfg Config) string {
	return request.AuditClientIP(c, cfg)
}

func dashboardUsernameFromGin(c *gin.Context) string {
	return authz.DashboardUsernameFromGin(c)
}
