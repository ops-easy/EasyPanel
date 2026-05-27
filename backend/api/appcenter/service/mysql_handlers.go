package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	mysql "github.com/go-sql-driver/mysql"
)

func RegisterMySQLRoutes(api *gin.RouterGroup, app *ServerApp) {
	g := api.Group("/app-center/mysql")
	g.GET("/status", func(c *gin.Context) { handleAppMySQLStatus(c, app) })
	g.GET("/instances", func(c *gin.Context) { handleAppMySQLList(c, app) })
	g.POST("/instances", func(c *gin.Context) { handleAppMySQLCreate(c, app) })
	g.POST("/instances/:id/ping", func(c *gin.Context) { handleAppMySQLPing(c, app) })
	g.GET("/instances/:id/runtime", func(c *gin.Context) { handleAppMySQLRuntime(c, app) })
	g.GET("/instances/:id/schemas", func(c *gin.Context) { handleAppMySQLSchemas(c, app) })
	g.GET("/instances/:id/tables", func(c *gin.Context) { handleAppMySQLTables(c, app) })
	g.GET("/instances/:id/processlist", func(c *gin.Context) { handleAppMySQLProcesslist(c, app) })
	g.GET("/instances/:id/users", func(c *gin.Context) { handleAppMySQLUsers(c, app) })
	g.POST("/instances/:id/users", func(c *gin.Context) { handleAppMySQLUserCreate(c, app) })
	g.PUT("/instances/:id/users/:user/password", func(c *gin.Context) { handleAppMySQLUserPassword(c, app) })
	g.DELETE("/instances/:id/users/:user", func(c *gin.Context) { handleAppMySQLUserDelete(c, app) })
	g.GET("/instances/:id/backups", func(c *gin.Context) { handleAppMySQLBackupList(c, app) })
	g.POST("/instances/:id/backups", func(c *gin.Context) { handleAppMySQLBackupCreate(c, app) })
	g.POST("/instances/:id/backups/:backupId/restore", func(c *gin.Context) { handleAppMySQLBackupRestore(c, app) })
	g.DELETE("/instances/:id/backups/:backupId", func(c *gin.Context) { handleAppMySQLBackupDelete(c, app) })
	g.POST("/instances/:id/query", func(c *gin.Context) { handleAppMySQLQuery(c, app) })
	g.GET("/instances/:id/mysql-cli/ws", func(c *gin.Context) { handleAppMySQLCLIExecWS(c, app) })
	g.GET("/instances/:id/k8s-status", func(c *gin.Context) { handleAppMySQLK8sRolloutStatus(c, app) })
	g.GET("/instances/:id/k8s-network", func(c *gin.Context) { handleAppMySQLK8sNetwork(c, app) })
	g.GET("/instances/:id", func(c *gin.Context) { handleAppMySQLGet(c, app) })
	g.PUT("/instances/:id", func(c *gin.Context) { handleAppMySQLUpdate(c, app) })
	g.DELETE("/instances/:id", func(c *gin.Context) { handleAppMySQLDelete(c, app) })
	g.POST("/k8s-deploy", func(c *gin.Context) { handleAppMySQLK8sDeploy(c, app) })
	g.GET("/templates", func(c *gin.Context) { handleAppMySQLTemplateList(c, app) })
	g.POST("/templates", func(c *gin.Context) { handleAppMySQLTemplateCreate(c, app) })
	g.GET("/templates/:id", func(c *gin.Context) { handleAppMySQLTemplateGet(c, app) })
	g.PUT("/templates/:id", func(c *gin.Context) { handleAppMySQLTemplateUpdate(c, app) })
	g.DELETE("/templates/:id", func(c *gin.Context) { handleAppMySQLTemplateDelete(c, app) })
}

func appCenterMySQLWriteDenied(c *gin.Context) bool {
	if getDashboardRoleFromGin(c) == DashboardRoleAdmin {
		return false
	}
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff.LegacyViewer {
		return true
	}
	if eff.AppCenter == ModuleAccessNone || eff.AppCenter == ModuleAccessRO {
		return true
	}
	if appMySQLPermissionScope(c) == AppCenterRedisScopeReadonly {
		return true
	}
	return false
}

func appMySQLPermissionScope(c *gin.Context) string {
	eff := getEffectiveDashboardPermissionsFromGin(c)
	if eff == nil {
		return AppCenterRedisScopeReadonly
	}
	scope := strings.TrimSpace(eff.AppCenterMySQL)
	if scope == "" {
		scope = strings.TrimSpace(eff.AppCenterRedis)
	}
	switch scope {
	case AppCenterRedisScopeReadonly, AppCenterRedisScopeManagedOnly, AppCenterRedisScopeFull:
		return scope
	default:
		return AppCenterRedisScopeFull
	}
}

func appMySQLRequireWrite(c *gin.Context) bool {
	if appCenterMySQLWriteDenied(c) {
		RespondAPIPermissionDenied(c)
		return false
	}
	return true
}

func appMySQLRowVisibleForUser(c *gin.Context, row *appMySQLRow) bool {
	if appMySQLPermissionScope(c) != AppCenterRedisScopeManagedOnly {
		return true
	}
	user := dashboardUsernameFromGin(c)
	if user == "" {
		return false
	}
	var st appMySQLStoredConfig
	if err := json.Unmarshal([]byte(row.ConfigJSON), &st); err != nil {
		return false
	}
	if appMySQLStoredIsPlatformK8s(&st) {
		return false
	}
	return strings.TrimSpace(row.CreatedBy) == user
}

func appMySQLManagedOnlyCanMutateRow(c *gin.Context, row *appMySQLRow) bool {
	return appMySQLRowVisibleForUser(c, row)
}

func handleAppMySQLStatus(c *gin.Context, app *ServerApp) {
	cfg := app.Cfg()
	keyErr := error(nil)
	_, err := sshEncryptionKey(cfg)
	if err != nil {
		keyErr = err
	}
	out := gin.H{
		"mysqlReachable":  app.MySQLDB() != nil,
		"encryptionReady": keyErr == nil,
		"k8sReady":        app.K8s() != nil,
	}
	if keyErr != nil {
		out["encryptionError"] = keyErr.Error()
	}
	if app.MySQLDB() == nil && app.MySQLConnectError() != "" {
		out["mysqlConnectError"] = app.MySQLConnectError()
	}
	c.JSON(http.StatusOK, out)
}

func handleAppMySQLList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"instances": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rows, err := appMySQLListFromMySQL(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	list := make([]interface{}, 0, len(rows))
	for _, row := range rows {
		if !appMySQLRowVisibleForUser(c, &row) {
			continue
		}
		pub, err := appMySQLRowToPublic(row)
		if err == nil {
			list = append(list, pub)
		}
	}
	c.JSON(http.StatusOK, gin.H{"instances": list, "mysqlRequired": false})
}

func handleAppMySQLCreate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(stringFromBody(body, "name"))
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	st, err := buildAppMySQLStoredConfigFromRequest(app.Cfg(), body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if appMySQLPermissionScope(c) == AppCenterRedisScopeManagedOnly && appMySQLStoredIsPlatformK8s(st) {
		RespondAPIPermissionDenied(c)
		return
	}
	raw, err := mustMarshalAppMySQLStoredConfig(st)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	id, err := appMySQLInsert(ctx, db, name, string(st.Mode), raw, createdBy)
	if err != nil {
		var me *mysql.MySQLError
		if errors.As(err, &me) && me.Number == 1062 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "instance name already exists"})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql create instance %s id=%d", name, id))
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func handleAppMySQLGet(c *gin.Context, app *ServerApp) {
	row, ok := appMySQLLoadRowForRequest(c, app, 10*time.Second)
	if !ok {
		return
	}
	pub, err := appMySQLRowToPublic(*row)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, pub)
}

func handleAppMySQLUpdate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	id, ok := appMySQLParamID(c)
	if !ok {
		return
	}
	var body map[string]interface{}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	prev, err := appMySQLGetByID(ctx, db, id)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return
	}
	if !appMySQLManagedOnlyCanMutateRow(c, prev) {
		RespondAPIPermissionDenied(c)
		return
	}
	var prevCfg appMySQLStoredConfig
	if err := json.Unmarshal([]byte(prev.ConfigJSON), &prevCfg); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	name := strings.TrimSpace(prev.Name)
	if v := strings.TrimSpace(stringFromBody(body, "name")); v != "" {
		name = v
	}
	next, err := mergeAppMySQLStoredConfigOnUpdate(app.Cfg(), &prevCfg, body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if appMySQLPermissionScope(c) == AppCenterRedisScopeManagedOnly && appMySQLStoredIsPlatformK8s(next) {
		RespondAPIPermissionDenied(c)
		return
	}
	raw, err := mustMarshalAppMySQLStoredConfig(next)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	if err := appMySQLUpdate(ctx, db, id, name, string(next.Mode), raw); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql update instance %s id=%d", name, id))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleAppMySQLDelete(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	id, ok := appMySQLParamID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Minute)
	defer cancel()
	row, err := appMySQLGetByID(ctx, db, id)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return
	}
	if !appMySQLManagedOnlyCanMutateRow(c, row) {
		RespondAPIPermissionDenied(c)
		return
	}
	var st appMySQLStoredConfig
	_ = json.Unmarshal([]byte(row.ConfigJSON), &st)
	var k8sWarnings []string
	if appMySQLStoredIsPlatformK8s(&st) && app.K8s() != nil {
		deletePVC := strings.EqualFold(c.Query("deletePVC"), "true") || strings.EqualFold(c.Query("deleteData"), "true")
		k8sWarnings = DeleteAppMySQLK8sStack(ctx, app.K8s(), st.K8sNamespace, st.K8sBaseName, deletePVC)
	}
	if err := appMySQLDelete(ctx, db, id); err != nil {
		RespondAPIErrorMerged(c, http.StatusInternalServerError, err.Error(), gin.H{"k8sWarnings": k8sWarnings})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql delete instance %s id=%d", row.Name, id))
	c.JSON(http.StatusOK, gin.H{"ok": true, "k8sWarnings": k8sWarnings})
}

func handleAppMySQLPing(c *gin.Context, app *ServerApp) {
	st, _, ok := appMySQLLoadStoredForRequest(c, app, 10*time.Second)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 12*time.Second)
	defer cancel()
	db, closeFn, err := openAppMySQLDB(ctx, app.Cfg(), st)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer closeFn()
	start := time.Now()
	if err := db.PingContext(ctx); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var ver string
	_ = db.QueryRowContext(ctx, `SELECT VERSION()`).Scan(&ver)
	c.JSON(http.StatusOK, gin.H{"ok": true, "latencyMs": time.Since(start).Milliseconds(), "version": ver})
}

func handleAppMySQLRuntime(c *gin.Context, app *ServerApp) {
	withAppMySQLInstanceDB(c, app, 25*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, _ *appMySQLRow) {
		out, err := appMySQLRuntimeSnapshot(ctx, db)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, out)
	})
}

func handleAppMySQLSchemas(c *gin.Context, app *ServerApp) {
	withAppMySQLInstanceDB(c, app, 25*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, _ *appMySQLRow) {
		schemas, err := appMySQLSchemas(ctx, db)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"schemas": schemas})
	})
}

func handleAppMySQLTables(c *gin.Context, app *ServerApp) {
	withAppMySQLInstanceDB(c, app, 30*time.Second, func(ctx context.Context, db *sql.DB, st *appMySQLStoredConfig, _ *appMySQLRow) {
		schema := strings.TrimSpace(c.Query("schema"))
		if schema == "" {
			schema = strings.TrimSpace(st.DefaultSchema)
		}
		if schema == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "schema is required"})
			return
		}
		tables, err := appMySQLTables(ctx, db, schema)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"schema": schema, "tables": tables})
	})
}

func handleAppMySQLProcesslist(c *gin.Context, app *ServerApp) {
	withAppMySQLInstanceDB(c, app, 20*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, _ *appMySQLRow) {
		limit, _ := strconv.Atoi(strings.TrimSpace(c.DefaultQuery("limit", "100")))
		rows, err := appMySQLProcesslist(ctx, db, limit)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"processes": rows})
	})
}

func handleAppMySQLUsers(c *gin.Context, app *ServerApp) {
	withAppMySQLInstanceDB(c, app, 25*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, _ *appMySQLRow) {
		users, err := appMySQLListUsers(ctx, db)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"users": users})
	})
}

func handleAppMySQLUserCreate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	var body appMySQLUserWriteBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	withAppMySQLInstanceDB(c, app, 30*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, row *appMySQLRow) {
		if !appMySQLManagedOnlyCanMutateRow(c, row) {
			RespondAPIPermissionDenied(c)
			return
		}
		if err := appMySQLCreateUser(ctx, db, body); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		SetAuditDetail(c, fmt.Sprintf("app-center mysql create user instance=%d user=%s host=%s role=%s", row.ID, body.Username, firstNonEmpty(body.Host, "%"), body.Role))
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}

func handleAppMySQLUserPassword(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	var body struct {
		Host     string `json:"host"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user := c.Param("user")
	withAppMySQLInstanceDB(c, app, 30*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, row *appMySQLRow) {
		if !appMySQLManagedOnlyCanMutateRow(c, row) {
			RespondAPIPermissionDenied(c)
			return
		}
		if err := appMySQLChangeUserPassword(ctx, db, user, body.Host, body.Password); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		SetAuditDetail(c, fmt.Sprintf("app-center mysql change user password instance=%d user=%s host=%s", row.ID, user, firstNonEmpty(body.Host, "%")))
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}

func handleAppMySQLUserDelete(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	user := c.Param("user")
	host := c.DefaultQuery("host", "%")
	withAppMySQLInstanceDB(c, app, 30*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, row *appMySQLRow) {
		if !appMySQLManagedOnlyCanMutateRow(c, row) {
			RespondAPIPermissionDenied(c)
			return
		}
		if err := appMySQLDropUser(ctx, db, user, host); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		SetAuditDetail(c, fmt.Sprintf("app-center mysql delete user instance=%d user=%s host=%s", row.ID, user, host))
		c.JSON(http.StatusOK, gin.H{"ok": true})
	})
}

func handleAppMySQLBackupList(c *gin.Context, app *ServerApp) {
	row, ok := appMySQLLoadRowForRequest(c, app, 15*time.Second)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	backups, err := appMySQLBackupList(ctx, app.MySQLDB(), row.ID)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	out := make([]map[string]interface{}, 0, len(backups))
	for _, backup := range backups {
		out = append(out, appMySQLBackupPublic(backup))
	}
	c.JSON(http.StatusOK, gin.H{"backups": out})
}

func handleAppMySQLBackupCreate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	var body struct {
		Schema     string `json:"schema"`
		BackupName string `json:"backupName"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	st, row, ok := appMySQLLoadStoredForRequest(c, app, 15*time.Second)
	if !ok {
		return
	}
	if !appMySQLManagedOnlyCanMutateRow(c, row) {
		RespondAPIPermissionDenied(c)
		return
	}
	if !appMySQLStoredIsPlatformK8s(st) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "backups are supported for platform-managed K8s MySQL instances"})
		return
	}
	schema := firstNonEmpty(body.Schema, st.DefaultSchema)
	if err := appMySQLValidateBusinessSchema(schema); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	backupName := strings.TrimSpace(body.BackupName)
	if backupName == "" {
		backupName = appMySQLBackupName(schema, time.Now())
	}
	cmd, err := appMySQLBuildBackupCommand(schema, backupName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user := dashboardUsernameFromGin(c)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()
	backupID, err := appMySQLBackupInsert(ctx, app.MySQLDB(), row.ID, backupName, appMySQLBackupStorageRef(backupName), user)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	stdout, stderr, err := appMySQLExecManagedPod(ctx, app, st, cmd)
	if err != nil {
		_ = appMySQLBackupMarkFinished(ctx, app.MySQLDB(), backupID, "failed", 0, stderr+" "+err.Error())
		c.JSON(http.StatusBadRequest, gin.H{"error": truncateErrMessage(strings.TrimSpace(stderr+" "+err.Error()), 512), "backupId": backupID})
		return
	}
	size := appMySQLParseBackupSize(stdout)
	if err := appMySQLBackupMarkFinished(ctx, app.MySQLDB(), backupID, "completed", size, ""); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql backup instance=%d schema=%s backup=%s size=%d", row.ID, schema, backupName, size))
	c.JSON(http.StatusOK, gin.H{"id": backupID, "backupName": backupName, "status": "completed", "sizeBytes": size})
}

func handleAppMySQLBackupRestore(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	if !GuardK8sREST(c, app.K8s(), app.K8sREST()) {
		return
	}
	var body struct {
		Confirm      bool   `json:"confirm"`
		TargetSchema string `json:"targetSchema"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !body.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "restore requires confirm=true"})
		return
	}
	st, row, ok := appMySQLLoadStoredForRequest(c, app, 15*time.Second)
	if !ok {
		return
	}
	if !appMySQLManagedOnlyCanMutateRow(c, row) {
		RespondAPIPermissionDenied(c)
		return
	}
	backupID, ok := appMySQLBackupParamID(c)
	if !ok {
		return
	}
	target := firstNonEmpty(body.TargetSchema, st.DefaultSchema)
	if err := appMySQLValidateBusinessSchema(target); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Minute)
	defer cancel()
	backup, err := appMySQLBackupGet(ctx, app.MySQLDB(), row.ID, backupID)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return
	}
	if backup.Status != "completed" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "only completed backups can be restored"})
		return
	}
	cmd, err := appMySQLBuildRestoreCommand(backup.BackupName, target)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if _, stderr, err := appMySQLExecManagedPod(ctx, app, st, cmd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": truncateErrMessage(strings.TrimSpace(stderr+" "+err.Error()), 512)})
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql restore instance=%d backup=%d targetSchema=%s", row.ID, backupID, target))
	c.JSON(http.StatusOK, gin.H{"ok": true, "backupId": backupID, "targetSchema": target})
}

func handleAppMySQLBackupDelete(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	st, row, ok := appMySQLLoadStoredForRequest(c, app, 15*time.Second)
	if !ok {
		return
	}
	if !appMySQLManagedOnlyCanMutateRow(c, row) {
		RespondAPIPermissionDenied(c)
		return
	}
	backupID, ok := appMySQLBackupParamID(c)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Minute)
	defer cancel()
	backup, err := appMySQLBackupGet(ctx, app.MySQLDB(), row.ID, backupID)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return
	}
	var fileWarning string
	if appMySQLStoredIsPlatformK8s(st) && app.K8s() != nil && app.K8sREST() != nil {
		if _, stderr, err := appMySQLExecManagedPod(ctx, app, st, appMySQLBuildDeleteBackupCommand(backup.BackupName)); err != nil {
			fileWarning = truncateErrMessage(strings.TrimSpace(stderr+" "+err.Error()), 512)
		}
	}
	if err := appMySQLBackupDelete(ctx, app.MySQLDB(), row.ID, backupID); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql delete backup instance=%d backup=%d", row.ID, backupID))
	out := gin.H{"ok": true}
	if fileWarning != "" {
		out["fileWarning"] = fileWarning
	}
	c.JSON(http.StatusOK, out)
}

type appMySQLQueryBody struct {
	SQL             string `json:"sql"`
	Schema          string `json:"schema"`
	Limit           int    `json:"limit"`
	ConfirmMutation bool   `json:"confirmMutation"`
}

type appMySQLQueryRunner interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func appMySQLRunnerForSchema(ctx context.Context, db *sql.DB, schema string) (appMySQLQueryRunner, func(), error) {
	schema = strings.TrimSpace(schema)
	if schema == "" {
		return db, func() {}, nil
	}
	quoted, err := appMySQLQuoteIdentifier(schema)
	if err != nil {
		return nil, func() {}, err
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return nil, func() {}, err
	}
	cleanup := func() { _ = conn.Close() }
	if _, err := conn.ExecContext(ctx, "USE "+quoted); err != nil {
		cleanup()
		return nil, func() {}, err
	}
	return conn, cleanup, nil
}

func handleAppMySQLQuery(c *gin.Context, app *ServerApp) {
	var body appMySQLQueryBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	stmt, ok := appMySQLFirstStatement(body.SQL)
	if !ok || stmt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "single SQL statement is required"})
		return
	}
	readOnly := appMySQLQueryAllowedWithoutMutationConfirm(stmt)
	if !readOnly {
		if !body.ConfirmMutation {
			c.JSON(http.StatusBadRequest, gin.H{"error": "mutation SQL requires confirmMutation=true"})
			return
		}
		if !appMySQLRequireWrite(c) {
			return
		}
	}
	withAppMySQLInstanceDB(c, app, 60*time.Second, func(ctx context.Context, db *sql.DB, _ *appMySQLStoredConfig, _ *appMySQLRow) {
		runner, cleanup, err := appMySQLRunnerForSchema(ctx, db, body.Schema)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		defer cleanup()
		if readOnly {
			rows, err := runner.QueryContext(ctx, stmt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			defer rows.Close()
			result, err := sqlRowsToJSON(rows, appMySQLLimitRows(body.Limit))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"readOnly": true, "rows": result.Rows, "columns": result.Columns, "truncated": result.Truncated})
			return
		}
		res, err := runner.ExecContext(ctx, stmt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		affected, _ := res.RowsAffected()
		lastID, _ := res.LastInsertId()
		SetAuditDetail(c, fmt.Sprintf("app-center mysql execute mutation instance=%s keyword=%s affected=%d", c.Param("id"), appMySQLLeadingKeyword(stmt), affected))
		c.JSON(http.StatusOK, gin.H{"readOnly": false, "rowsAffected": affected, "lastInsertId": lastID})
	})
}

type appMySQLK8sDeployBody struct {
	Namespace          string `json:"namespace"`
	BaseName           string `json:"baseName"`
	Version            string `json:"version"`
	RootPassword       string `json:"rootPassword"`
	Database           string `json:"database"`
	AppUsername        string `json:"appUsername"`
	AppPassword        string `json:"appPassword"`
	PodPort            int32  `json:"podPort"`
	SvcPort            int32  `json:"svcPort"`
	ServiceType        string `json:"serviceType"`
	NodePortMySQL      int32  `json:"nodePortMysql"`
	EnableExporter     *bool  `json:"enableExporter"`
	MySQLImage         string `json:"mysqlImage"`
	ExporterImage      string `json:"exporterImage"`
	ImagePullSecret    string `json:"imagePullSecret"`
	PersistenceEnabled *bool  `json:"persistenceEnabled"`
	StorageSize        string `json:"storageSize"`
	StorageClassName   string `json:"storageClassName"`
	MySQLCPURequest    string `json:"mysqlCpuRequest"`
	MySQLCPULimit      string `json:"mysqlCpuLimit"`
	MySQLMemoryRequest string `json:"mysqlMemoryRequest"`
	MySQLMemoryLimit   string `json:"mysqlMemoryLimit"`
	TemplateID         int64  `json:"templateId"`
}

func handleAppMySQLK8sDeploy(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	var body appMySQLK8sDeployBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	enableExporter := true
	if body.EnableExporter != nil {
		enableExporter = *body.EnableExporter
	}
	persistence := true
	if body.PersistenceEnabled != nil {
		persistence = *body.PersistenceEnabled
	}
	opts := AppMySQLK8sDeployOpts{
		Namespace:          strings.TrimSpace(body.Namespace),
		BaseName:           strings.TrimSpace(body.BaseName),
		Version:            firstNonEmpty(body.Version, "8.0"),
		RootPassword:       body.RootPassword,
		Database:           strings.TrimSpace(body.Database),
		AppUsername:        strings.TrimSpace(body.AppUsername),
		AppPassword:        body.AppPassword,
		PodPort:            body.PodPort,
		SvcPort:            body.SvcPort,
		ServiceType:        strings.TrimSpace(body.ServiceType),
		NodePortMySQL:      body.NodePortMySQL,
		EnableExporter:     enableExporter,
		MySQLImage:         strings.TrimSpace(body.MySQLImage),
		ExporterImage:      strings.TrimSpace(body.ExporterImage),
		ImagePullSecret:    strings.TrimSpace(body.ImagePullSecret),
		PersistenceEnabled: persistence,
		StorageSize:        strings.TrimSpace(body.StorageSize),
		StorageClassName:   strings.TrimSpace(body.StorageClassName),
		MySQLCPURequest:    strings.TrimSpace(body.MySQLCPURequest),
		MySQLCPULimit:      strings.TrimSpace(body.MySQLCPULimit),
		MySQLMemoryRequest: strings.TrimSpace(body.MySQLMemoryRequest),
		MySQLMemoryLimit:   strings.TrimSpace(body.MySQLMemoryLimit),
		TemplateID:         body.TemplateID,
	}
	db := app.MySQLDB()
	if db != nil && body.TemplateID > 0 {
		ctxTpl, cancelTpl := context.WithTimeout(c.Request.Context(), 15*time.Second)
		defer cancelTpl()
		tpl, err := appMySQLTemplateGetByID(ctxTpl, db, body.TemplateID)
		if err != nil {
			writeAppMySQLLoadError(c, err)
			return
		}
		tcfg, err := parseAppMySQLTemplateConfig(tpl.ConfigJSON)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid template config: " + err.Error()})
			return
		}
		if err := validateAppMySQLTemplateConfig(tcfg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		opts.MySQLImage = strings.TrimSpace(tcfg.MySQLImage)
		opts.ExporterImage = firstNonEmpty(body.ExporterImage, tcfg.ExporterImage)
		opts.ImagePullSecret = strings.TrimSpace(tcfg.ImagePullSecret)
		opts.TemplateName = tpl.Name
		if strings.TrimSpace(opts.Version) == "" {
			opts.Version = firstNonEmpty(tcfg.DefaultVersion, "8.0")
		}
		opts.StorageSize = firstNonEmpty(opts.StorageSize, tcfg.DefaultStorageSize)
		opts.StorageClassName = firstNonEmpty(opts.StorageClassName, tcfg.DefaultStorageClass)
		if body.EnableExporter == nil && tcfg.DefaultEnableExporter != nil {
			opts.EnableExporter = *tcfg.DefaultEnableExporter
		}
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Minute)
	defer cancel()
	if err := EnsureAppMySQLK8sDeployNoNameConflict(ctx, k8s, opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := ApplyAppMySQLK8sDeploy(ctx, k8s, app.Cfg(), opts); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var instanceID int64
	var instanceWarning string
	if db != nil {
		st, err := BuildK8sMySQLStoredConfig(app.Cfg(), opts)
		if err != nil {
			instanceWarning = err.Error()
		} else {
			raw, _ := mustMarshalAppMySQLStoredConfig(st)
			name := fmt.Sprintf("%s/%s", opts.Namespace, opts.BaseName)
			user, _ := c.Get("dashboardUser")
			createdBy, _ := user.(string)
			var existing int64
			qerr := db.QueryRowContext(ctx, `SELECT id FROM easypanel_app_mysql_instances WHERE name=?`, name).Scan(&existing)
			if qerr == sql.ErrNoRows {
				instanceID, qerr = appMySQLInsert(ctx, db, name, string(st.Mode), raw, createdBy)
			} else if qerr == nil {
				qerr = appMySQLUpdate(ctx, db, existing, name, string(st.Mode), raw)
				instanceID = existing
			}
			if qerr != nil {
				instanceWarning = qerr.Error()
			}
		}
	} else {
		instanceWarning = "MySQL metadata store is not connected; instance was not recorded"
	}
	services := CollectAppMySQLK8sNetwork(ctx, k8s, opts)
	SetAuditDetail(c, fmt.Sprintf("app-center mysql deploy to %s/%s", opts.Namespace, opts.BaseName))
	out := gin.H{"ok": true, "namespace": opts.Namespace, "deployment": opts.BaseName, "network": services}
	if instanceID > 0 {
		out["instanceId"] = instanceID
	}
	if instanceWarning != "" {
		out["instanceWarning"] = instanceWarning
	}
	c.JSON(http.StatusOK, out)
}

func handleAppMySQLK8sRolloutStatus(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	st, _, ok := appMySQLLoadStoredForRequest(c, app, 25*time.Second)
	if !ok {
		return
	}
	status, err := AppMySQLK8sRolloutStatus(c.Request.Context(), k8s, st)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, status)
}

func handleAppMySQLK8sNetwork(c *gin.Context, app *ServerApp) {
	k8s := app.K8s()
	if !GuardK8s(c, k8s) {
		return
	}
	st, _, ok := appMySQLLoadStoredForRequest(c, app, 25*time.Second)
	if !ok {
		return
	}
	opts, ok := AppMySQLK8sDeployOptsFromStored(st)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "instance is not managed by platform K8s deploy"})
		return
	}
	services := CollectAppMySQLK8sNetwork(c.Request.Context(), k8s, opts)
	c.JSON(http.StatusOK, gin.H{"services": services})
}

func handleAppMySQLTemplateList(c *gin.Context, app *ServerApp) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusOK, gin.H{"templates": []interface{}{}, "mysqlRequired": true})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()
	rows, err := appMySQLTemplateListFromMySQL(ctx, db)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	list := make([]interface{}, 0, len(rows))
	for _, row := range rows {
		pub, err := appMySQLTemplateRowToPublic(row)
		if err == nil {
			list = append(list, pub)
		}
	}
	c.JSON(http.StatusOK, gin.H{"templates": list, "mysqlRequired": false})
}

func handleAppMySQLTemplateGet(c *gin.Context, app *ServerApp) {
	id, ok := appMySQLParamID(c)
	if !ok {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	row, err := appMySQLTemplateGetByID(ctx, db, id)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return
	}
	pub, err := appMySQLTemplateRowToPublic(*row)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	c.JSON(http.StatusOK, pub)
}

type appMySQLTemplateWriteBody struct {
	Name        string                  `json:"name"`
	Description string                  `json:"description"`
	Config      *AppMySQLTemplateConfig `json:"config"`
}

func handleAppMySQLTemplateCreate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	var body appMySQLTemplateWriteBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || body.Config == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and config are required"})
		return
	}
	if err := validateAppMySQLTemplateConfig(body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	raw, _ := json.Marshal(body.Config)
	user, _ := c.Get("dashboardUser")
	createdBy, _ := user.(string)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	id, err := appMySQLTemplateInsert(ctx, db, name, body.Description, string(raw), createdBy)
	if err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql create template %s id=%d", name, id))
	c.JSON(http.StatusOK, gin.H{"id": id})
}

func handleAppMySQLTemplateUpdate(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	id, ok := appMySQLParamID(c)
	if !ok {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	var body appMySQLTemplateWriteBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" || body.Config == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and config are required"})
		return
	}
	if err := validateAppMySQLTemplateConfig(body.Config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	raw, _ := json.Marshal(body.Config)
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := appMySQLTemplateUpdate(ctx, db, id, name, body.Description, string(raw)); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql update template %s id=%d", name, id))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func handleAppMySQLTemplateDelete(c *gin.Context, app *ServerApp) {
	if !appMySQLRequireWrite(c) {
		return
	}
	id, ok := appMySQLParamID(c)
	if !ok {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	if err := appMySQLTemplateDelete(ctx, db, id); err != nil {
		RespondAPIError500(c, err.Error())
		return
	}
	SetAuditDetail(c, fmt.Sprintf("app-center mysql delete template id=%d", id))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func appMySQLParamID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return id, true
}

func appMySQLBackupParamID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("backupId"), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid backup id"})
		return 0, false
	}
	return id, true
}

func appMySQLLoadRowForRequest(c *gin.Context, app *ServerApp, timeout time.Duration) (*appMySQLRow, bool) {
	db := app.MySQLDB()
	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MySQL metadata store is not connected"})
		return nil, false
	}
	id, ok := appMySQLParamID(c)
	if !ok {
		return nil, false
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()
	row, err := appMySQLGetByID(ctx, db, id)
	if err != nil {
		writeAppMySQLLoadError(c, err)
		return nil, false
	}
	if !appMySQLRowVisibleForUser(c, row) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return nil, false
	}
	return row, true
}

func appMySQLLoadStoredForRequest(c *gin.Context, app *ServerApp, timeout time.Duration) (*appMySQLStoredConfig, *appMySQLRow, bool) {
	row, ok := appMySQLLoadRowForRequest(c, app, timeout)
	if !ok {
		return nil, nil, false
	}
	var st appMySQLStoredConfig
	if err := json.Unmarshal([]byte(row.ConfigJSON), &st); err != nil {
		RespondAPIError500(c, err.Error())
		return nil, nil, false
	}
	return &st, row, true
}

func withAppMySQLInstanceDB(c *gin.Context, app *ServerApp, timeout time.Duration, fn func(context.Context, *sql.DB, *appMySQLStoredConfig, *appMySQLRow)) {
	st, row, ok := appMySQLLoadStoredForRequest(c, app, timeout)
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
	defer cancel()
	db, closeFn, err := openAppMySQLDB(ctx, app.Cfg(), st)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	defer closeFn()
	fn(ctx, db, st, row)
}

func writeAppMySQLLoadError(c *gin.Context, err error) {
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
}

type sqlJSONRows struct {
	Columns   []string
	Rows      []map[string]interface{}
	Truncated bool
}

func sqlRowsToJSON(rows *sql.Rows, limit int) (*sqlJSONRows, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := &sqlJSONRows{Columns: cols}
	count := 0
	for rows.Next() {
		values := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		if count >= limit {
			out.Truncated = true
			continue
		}
		item := map[string]interface{}{}
		for i, col := range cols {
			switch v := values[i].(type) {
			case []byte:
				item[col] = string(v)
			case time.Time:
				item[col] = v.Format(time.RFC3339Nano)
			default:
				item[col] = v
			}
		}
		out.Rows = append(out.Rows, item)
		count++
	}
	return out, rows.Err()
}
