package authz

import (
	core "kube-bt-sync/internal"

	"github.com/gin-gonic/gin"
)

type EffectiveDashboardPermissions = core.EffectiveDashboardPermissions

const (
	DashboardRoleAdmin  = core.DashboardRoleAdmin
	DashboardRoleViewer = core.DashboardRoleViewer
	ModuleAccessNone    = core.ModuleAccessNone
	ModuleAccessRO      = core.ModuleAccessRO
	ModuleAccessRW      = core.ModuleAccessRW
)

func DashboardRoleFromGin(c *gin.Context) string {
	return core.DashboardRoleFromGin(c)
}

func EffectiveDashboardPermissionsFromGin(c *gin.Context) *EffectiveDashboardPermissions {
	return core.EffectiveDashboardPermissionsFromGin(c)
}
