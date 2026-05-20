package core

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
)

const dashboardUserSeedTestDriverName = "kubebt_dashboard_user_seed_test"

var dashboardUserSeedState = struct {
	sync.Mutex
	userCount int64
	execCount int
	username  string
	role      string
	hash      string
}{}

func init() {
	sql.Register(dashboardUserSeedTestDriverName, dashboardUserSeedTestDriver{})
}

type dashboardUserSeedTestDriver struct{}

func (dashboardUserSeedTestDriver) Open(string) (driver.Conn, error) {
	return dashboardUserSeedTestConn{}, nil
}

type dashboardUserSeedTestConn struct{}

func (dashboardUserSeedTestConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("测试驱动不支持 Prepare")
}

func (dashboardUserSeedTestConn) Close() error {
	return nil
}

func (dashboardUserSeedTestConn) Begin() (driver.Tx, error) {
	return nil, errors.New("测试驱动不支持事务")
}

func (dashboardUserSeedTestConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	if strings.Contains(query, "SELECT COUNT(*) FROM kubebt_dashboard_users") {
		dashboardUserSeedState.Lock()
		n := dashboardUserSeedState.userCount
		dashboardUserSeedState.Unlock()
		return &dashboardUserSeedRows{value: n}, nil
	}
	return nil, errors.New("测试驱动未匹配查询")
}

func (dashboardUserSeedTestConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if !strings.Contains(query, "INSERT INTO kubebt_dashboard_users") {
		return nil, errors.New("测试驱动未匹配写入")
	}
	dashboardUserSeedState.Lock()
	defer dashboardUserSeedState.Unlock()
	dashboardUserSeedState.execCount++
	dashboardUserSeedState.username, _ = args[0].Value.(string)
	dashboardUserSeedState.hash, _ = args[2].Value.(string)
	dashboardUserSeedState.role, _ = args[3].Value.(string)
	return driver.RowsAffected(1), nil
}

type dashboardUserSeedRows struct {
	value int64
	done  bool
}

func (r *dashboardUserSeedRows) Columns() []string {
	return []string{"n"}
}

func (r *dashboardUserSeedRows) Close() error {
	return nil
}

func (r *dashboardUserSeedRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	dest[0] = r.value
	return nil
}

func resetDashboardUserSeedState(userCount int64) {
	dashboardUserSeedState.Lock()
	defer dashboardUserSeedState.Unlock()
	dashboardUserSeedState.userCount = userCount
	dashboardUserSeedState.execCount = 0
	dashboardUserSeedState.username = ""
	dashboardUserSeedState.role = ""
	dashboardUserSeedState.hash = ""
}

func TestEnsureInitialDashboardAdminUserCreatesOnlyWhenUserTableEmpty(t *testing.T) {
	resetDashboardUserSeedState(0)
	db, err := sql.Open(dashboardUserSeedTestDriverName, "")
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	defer db.Close()

	created, err := ensureInitialDashboardAdminUser(db, Config{
		DashboardUser:     "root",
		DashboardPassword: "initial-pass",
	})
	if err != nil {
		t.Fatalf("ensure initial admin: %v", err)
	}
	if !created {
		t.Fatalf("created = false, want true")
	}
	dashboardUserSeedState.Lock()
	execCount := dashboardUserSeedState.execCount
	username := dashboardUserSeedState.username
	role := dashboardUserSeedState.role
	hash := dashboardUserSeedState.hash
	dashboardUserSeedState.Unlock()
	if execCount != 1 || username != "root" || role != DashboardRoleAdmin {
		t.Fatalf("insert state = count:%d username:%q role:%q", execCount, username, role)
	}
	if hash == "" || hash == "initial-pass" {
		t.Fatalf("password hash was not stored as bcrypt hash: %q", hash)
	}

	resetDashboardUserSeedState(1)
	created, err = ensureInitialDashboardAdminUser(db, Config{
		DashboardUser:     "root",
		DashboardPassword: "changed-pass",
	})
	if err != nil {
		t.Fatalf("ensure initial admin with existing users: %v", err)
	}
	if created {
		t.Fatalf("created = true, want false when user table is not empty")
	}
	dashboardUserSeedState.Lock()
	execCount = dashboardUserSeedState.execCount
	dashboardUserSeedState.Unlock()
	if execCount != 0 {
		t.Fatalf("exec count = %d, want 0", execCount)
	}
}
