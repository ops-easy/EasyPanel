package authz

import (
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	GinKeyDashboardUser = "dashboardUser"
	GinKeyDashboardRole = "dashboardRole"
)

// DashboardUser 返回当前 Dashboard 登录用户名。
func DashboardUser(c *gin.Context) string {
	u, _ := c.Get(GinKeyDashboardUser)
	s, _ := u.(string)
	return strings.TrimSpace(s)
}

// DashboardRole 返回当前 Dashboard 会话角色。
func DashboardRole(c *gin.Context) string {
	r, _ := c.Get(GinKeyDashboardRole)
	s, _ := r.(string)
	return strings.TrimSpace(s)
}
