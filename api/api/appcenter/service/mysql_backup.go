package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
)

const appMySQLBackupDir = "/var/lib/mysql/.kubebt-backups"

type appMySQLBackupRow struct {
	ID           int64
	InstanceID   int64
	BackupName   string
	Status       string
	StorageRef   string
	SizeBytes    int64
	StartedAt    string
	FinishedAt   string
	ErrorSummary string
	CreatedBy    string
	CreatedAt    string
}

func appMySQLBackupList(ctx context.Context, db *sql.DB, instanceID int64) ([]appMySQLBackupRow, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, instance_id, backup_name, status, storage_ref, size_bytes, started_at, finished_at, error_summary, created_by, created_at FROM kubebt_app_mysql_backups WHERE instance_id=? ORDER BY id DESC`, instanceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []appMySQLBackupRow
	for rows.Next() {
		var r appMySQLBackupRow
		var started, finished, created sql.NullTime
		if err := rows.Scan(&r.ID, &r.InstanceID, &r.BackupName, &r.Status, &r.StorageRef, &r.SizeBytes, &started, &finished, &r.ErrorSummary, &r.CreatedBy, &created); err != nil {
			return nil, err
		}
		if started.Valid {
			r.StartedAt = started.Time.UTC().Format(time.RFC3339)
		}
		if finished.Valid {
			r.FinishedAt = finished.Time.UTC().Format(time.RFC3339)
		}
		if created.Valid {
			r.CreatedAt = created.Time.UTC().Format(time.RFC3339)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func appMySQLBackupGet(ctx context.Context, db *sql.DB, instanceID, backupID int64) (*appMySQLBackupRow, error) {
	rows, err := appMySQLBackupList(ctx, db, instanceID)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.ID == backupID {
			return &row, nil
		}
	}
	return nil, sql.ErrNoRows
}

func appMySQLBackupInsert(ctx context.Context, db *sql.DB, instanceID int64, name, storageRef, createdBy string) (int64, error) {
	res, err := db.ExecContext(ctx, `INSERT INTO kubebt_app_mysql_backups (instance_id, backup_name, status, storage_ref, started_at, created_by) VALUES (?,?,'running',?,NOW(),?)`, instanceID, name, storageRef, createdBy)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func appMySQLBackupMarkFinished(ctx context.Context, db *sql.DB, backupID int64, status string, sizeBytes int64, errSummary string) error {
	_, err := db.ExecContext(ctx, `UPDATE kubebt_app_mysql_backups SET status=?, size_bytes=?, error_summary=?, finished_at=NOW() WHERE id=?`, status, sizeBytes, truncateErrMessage(errSummary, 512), backupID)
	return err
}

func appMySQLBackupDelete(ctx context.Context, db *sql.DB, instanceID, backupID int64) error {
	_, err := db.ExecContext(ctx, `DELETE FROM kubebt_app_mysql_backups WHERE instance_id=? AND id=?`, instanceID, backupID)
	return err
}

func appMySQLBackupPublic(row appMySQLBackupRow) map[string]interface{} {
	return map[string]interface{}{
		"id":           row.ID,
		"instanceId":   row.InstanceID,
		"backupName":   row.BackupName,
		"status":       row.Status,
		"storageRef":   row.StorageRef,
		"sizeBytes":    row.SizeBytes,
		"startedAt":    row.StartedAt,
		"finishedAt":   row.FinishedAt,
		"errorSummary": row.ErrorSummary,
		"createdBy":    row.CreatedBy,
		"createdAt":    row.CreatedAt,
	}
}

func appMySQLValidateBusinessSchema(schema string) error {
	s := strings.TrimSpace(schema)
	if s == "" {
		return errors.New("schema is required")
	}
	if len(s) > 64 {
		return errors.New("schema is too long")
	}
	switch strings.ToLower(s) {
	case "mysql", "information_schema", "performance_schema", "sys":
		return errors.New("system schema is not allowed")
	}
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '$' {
			continue
		}
		return errors.New("schema contains unsupported characters")
	}
	return nil
}

func appMySQLSanitizeBackupToken(s string) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteByte('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "mysql"
	}
	if len(out) > 80 {
		out = out[:80]
	}
	return out
}

func appMySQLBackupName(schema string, now time.Time) string {
	return fmt.Sprintf("%s-%s.sql", appMySQLSanitizeBackupToken(schema), now.UTC().Format("20060102T150405Z"))
}

func appMySQLBackupStorageRef(name string) string {
	return appMySQLBackupDir + "/" + appMySQLSanitizeBackupToken(name)
}

func appMySQLFindManagedPod(ctx context.Context, app *ServerApp, st *appMySQLStoredConfig) (string, error) {
	if app == nil || app.K8s() == nil || !appMySQLStoredIsPlatformK8s(st) {
		return "", errors.New("instance is not managed by platform K8s deploy")
	}
	selector := labels.Set(appMySQLLabels(st.K8sBaseName)).String()
	pods, err := app.K8s().CoreV1().Pods(st.K8sNamespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		return "", err
	}
	for _, pod := range pods.Items {
		if pod.DeletionTimestamp != nil || pod.Status.Phase != corev1.PodRunning {
			continue
		}
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.Name == "mysql" && cs.Ready {
				return pod.Name, nil
			}
		}
	}
	return "", errors.New("managed MySQL pod is not ready")
}

func appMySQLBuildBackupCommand(schema, backupName string) ([]string, error) {
	if err := appMySQLValidateBusinessSchema(schema); err != nil {
		return nil, err
	}
	file := appMySQLBackupStorageRef(backupName)
	script := fmt.Sprintf(
		"set -eu\nmkdir -p %s\nmysqldump --single-transaction --routines --events --triggers -h 127.0.0.1 -uroot -p\"$MYSQL_ROOT_PASSWORD\" %s > %s\nwc -c < %s\n",
		shellQuoteSingle(appMySQLBackupDir),
		shellQuoteSingle(strings.TrimSpace(schema)),
		shellQuoteSingle(file),
		shellQuoteSingle(file),
	)
	return []string{"/bin/sh", "-c", script}, nil
}

func appMySQLBuildRestoreCommand(backupName, targetSchema string) ([]string, error) {
	if err := appMySQLValidateBusinessSchema(targetSchema); err != nil {
		return nil, err
	}
	file := appMySQLBackupStorageRef(backupName)
	createSQL := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", strings.ReplaceAll(strings.TrimSpace(targetSchema), "`", "``"))
	script := fmt.Sprintf(
		"set -eu\npath=%s\ntest -f \"$path\"\nmysql -h 127.0.0.1 -uroot -p\"$MYSQL_ROOT_PASSWORD\" -e %s\nmysql -h 127.0.0.1 -uroot -p\"$MYSQL_ROOT_PASSWORD\" %s < \"$path\"\n",
		shellQuoteSingle(file),
		shellQuoteSingle(createSQL),
		shellQuoteSingle(strings.TrimSpace(targetSchema)),
	)
	return []string{"/bin/sh", "-c", script}, nil
}

func appMySQLBuildDeleteBackupCommand(backupName string) []string {
	file := appMySQLBackupStorageRef(backupName)
	return []string{"/bin/sh", "-c", "rm -f -- " + shellQuoteSingle(file)}
}

func appMySQLExecManagedPod(ctx context.Context, app *ServerApp, st *appMySQLStoredConfig, cmd []string) (string, string, error) {
	pod, err := appMySQLFindManagedPod(ctx, app, st)
	if err != nil {
		return "", "", err
	}
	stdout, stderr, err := k8sPodExecRun(ctx, app.K8s(), app.K8sREST(), st.K8sNamespace, pod, "mysql", cmd, nil)
	return stdout.String(), stderr.String(), err
}

func appMySQLParseBackupSize(stdout string) int64 {
	fields := strings.Fields(stdout)
	if len(fields) == 0 {
		return 0
	}
	n, _ := strconv.ParseInt(fields[len(fields)-1], 10, 64)
	return n
}
