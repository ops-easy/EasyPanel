package authz

import (
	"context"
	"database/sql"

	core "github.com/ops-easy/EasyPanel/backend/common/core"

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

func DashboardUsernameFromGin(c *gin.Context) string {
	return core.DashboardUsernameFromGin(c)
}

func EffectiveDashboardPermissionsFromGin(c *gin.Context) *EffectiveDashboardPermissions {
	return core.EffectiveDashboardPermissionsFromGin(c)
}

func AppRedisMaskSensitive(eff *EffectiveDashboardPermissions) bool {
	return core.AppRedisMaskSensitive(eff)
}

func NormalizeModuleAccess(s string) string {
	return core.NormalizeModuleAccess(s)
}

func VerifyDashboardUserCurrentPassword(db *sql.DB, ctx context.Context, username, password string) error {
	return core.VerifyDashboardUserCurrentPassword(db, ctx, username, password)
}
