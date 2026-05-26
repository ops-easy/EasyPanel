package core

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
)

const mysqlBootstrapTestDriverName = "easypanel_mysql_bootstrap_test"

var (
	mysqlBootstrapTestFailSubstring atomic.Value
	mysqlBootstrapTestExecCount     atomic.Int64
	mysqlBootstrapTestFailureCount  atomic.Int64
)

func init() {
	mysqlBootstrapTestFailSubstring.Store("")
	sql.Register(mysqlBootstrapTestDriverName, mysqlBootstrapTestDriver{})
}

type mysqlBootstrapTestDriver struct{}

func (mysqlBootstrapTestDriver) Open(string) (driver.Conn, error) {
	return mysqlBootstrapTestConn{}, nil
}

type mysqlBootstrapTestConn struct{}

func (mysqlBootstrapTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("测试驱动不支持 Prepare")
}

func (mysqlBootstrapTestConn) Close() error {
	return nil
}

func (mysqlBootstrapTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("测试驱动不支持事务")
}

func (mysqlBootstrapTestConn) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	mysqlBootstrapTestExecCount.Add(1)
	if needle, _ := mysqlBootstrapTestFailSubstring.Load().(string); needle != "" && strings.Contains(query, needle) {
		mysqlBootstrapTestFailureCount.Add(1)
		return nil, errors.New("模拟 DDL 失败")
	}
	return driver.RowsAffected(0), nil
}

func (mysqlBootstrapTestConn) QueryContext(context.Context, string, []driver.NamedValue) (driver.Rows, error) {
	return mysqlBootstrapEmptyRows{}, nil
}

type mysqlBootstrapEmptyRows struct{}

func (mysqlBootstrapEmptyRows) Columns() []string {
	return []string{"n"}
}

func (mysqlBootstrapEmptyRows) Close() error {
	return nil
}

func (mysqlBootstrapEmptyRows) Next([]driver.Value) error {
	return io.EOF
}

func TestMySQLApplyBootstrapDDLsReturnsErrorAfterTryingAllTables(t *testing.T) {
	mysqlBootstrapTestFailSubstring.Store("CREATE TABLE IF NOT EXISTS dns_accounts")
	mysqlBootstrapTestExecCount.Store(0)
	mysqlBootstrapTestFailureCount.Store(0)
	db, err := sql.Open(mysqlBootstrapTestDriverName, "")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer db.Close()

	err = mysqlApplyBootstrapDDLs(db)
	if err == nil {
		t.Fatalf("mysqlApplyBootstrapDDLs returned nil error")
	}
	if !strings.Contains(err.Error(), "dns_accounts") {
		t.Fatalf("error does not include failed table name: %v", err)
	}
	if got, want := mysqlBootstrapTestExecCount.Load(), int64(len(mysqlBootstrapTableDDLs)); got != want {
		t.Fatalf("exec count = %d, want %d", got, want)
	}
	if got := mysqlBootstrapTestFailureCount.Load(); got != 1 {
		t.Fatalf("failure count = %d, want 1", got)
	}
}

func TestMySQLBootstrapDDLsDoNotDefaultLargeTextColumns(t *testing.T) {
	largeTextDefault := regexp.MustCompile(`(?i)\b(TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|BLOB|JSON|GEOMETRY)\b[^,\n]*\bDEFAULT\b`)
	var bad []string
	for _, ddl := range mysqlBootstrapTableDDLs {
		for _, line := range strings.Split(ddl.SQL, "\n") {
			line = strings.TrimSpace(line)
			if largeTextDefault.MatchString(line) {
				bad = append(bad, ddl.Label+": "+line)
			}
		}
	}
	if len(bad) > 0 {
		t.Fatalf("large text/json columns cannot have DEFAULT in MySQL:\n%s", strings.Join(bad, "\n"))
	}
}

func TestMySQLBootstrapIncludesDocumentGuidesTable(t *testing.T) {
	var ddl string
	for _, item := range mysqlBootstrapTableDDLs {
		if item.Label == "easypanel_doc_guides" {
			ddl = item.SQL
			break
		}
	}
	if ddl == "" {
		t.Fatalf("mysqlBootstrapTableDDLs missing easypanel_doc_guides")
	}
	for _, want := range []string{
		"guide_key VARCHAR(128) NOT NULL",
		"route_pattern VARCHAR(255) NOT NULL",
		"match_type VARCHAR(16) NOT NULL DEFAULT 'prefix'",
		"doc_id BIGINT UNSIGNED NOT NULL",
		"UNIQUE KEY uq_doc_guides_key (guide_key)",
		"UNIQUE KEY uq_doc_guides_route (route_pattern, match_type)",
	} {
		if !strings.Contains(ddl, want) {
			t.Fatalf("easypanel_doc_guides DDL missing %q:\n%s", want, ddl)
		}
	}
}

func TestMySQLBootstrapIncludesAppCenterMySQLTables(t *testing.T) {
	ddls := map[string]string{}
	for _, item := range mysqlBootstrapTableDDLs {
		ddls[item.Label] = item.SQL
	}

	for _, table := range []string{
		"easypanel_app_mysql_instances",
		"easypanel_app_mysql_templates",
		"easypanel_app_mysql_backups",
	} {
		if ddls[table] == "" {
			t.Fatalf("mysqlBootstrapTableDDLs missing %s", table)
		}
	}

	for _, want := range []string{
		"name VARCHAR(160) NOT NULL",
		"mode VARCHAR(32) NOT NULL",
		"config_json MEDIUMTEXT NOT NULL",
		"UNIQUE KEY uniq_app_mysql_inst_name (name)",
	} {
		if !strings.Contains(ddls["easypanel_app_mysql_instances"], want) {
			t.Fatalf("easypanel_app_mysql_instances DDL missing %q:\n%s", want, ddls["easypanel_app_mysql_instances"])
		}
	}

	for _, want := range []string{
		"name VARCHAR(128) NOT NULL",
		"description VARCHAR(512) NULL",
		"config_json MEDIUMTEXT NOT NULL",
		"UNIQUE KEY uniq_app_mysql_tpl_name (name)",
	} {
		if !strings.Contains(ddls["easypanel_app_mysql_templates"], want) {
			t.Fatalf("easypanel_app_mysql_templates DDL missing %q:\n%s", want, ddls["easypanel_app_mysql_templates"])
		}
	}

	for _, want := range []string{
		"instance_id BIGINT UNSIGNED NOT NULL",
		"backup_name VARCHAR(160) NOT NULL",
		"status VARCHAR(32) NOT NULL",
		"INDEX idx_app_mysql_backup_inst (instance_id, id)",
		"UNIQUE KEY uniq_app_mysql_backup_name (instance_id, backup_name)",
	} {
		if !strings.Contains(ddls["easypanel_app_mysql_backups"], want) {
			t.Fatalf("easypanel_app_mysql_backups DDL missing %q:\n%s", want, ddls["easypanel_app_mysql_backups"])
		}
	}
}

func TestAppMySQLSchemaVersionBumpedForAppCenterMySQL(t *testing.T) {
	if AppMySQLSchemaVersion < 25 {
		t.Fatalf("AppMySQLSchemaVersion=%d, want at least 25 after app center MySQL tables", AppMySQLSchemaVersion)
	}
}
