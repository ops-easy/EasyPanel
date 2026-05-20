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

const mysqlBootstrapTestDriverName = "kubebt_mysql_bootstrap_test"

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
