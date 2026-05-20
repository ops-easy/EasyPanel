package service

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type Config = core.Config
type RedisLight = core.RedisLight
type ServerApp = core.ServerApp

func AuditClientIP(c *gin.Context, cfg Config) string {
	return core.AuditClientIP(c, cfg)
}

func dashboardUsernameFromGin(c *gin.Context) string {
	return core.DashboardUsernameFromGin(c)
}
