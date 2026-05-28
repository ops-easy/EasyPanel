package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
)

type appMySQLCLIMode string

const (
	appMySQLCLIModeUnsupported appMySQLCLIMode = "unsupported"
	appMySQLCLIModeK8s         appMySQLCLIMode = "k8s"
	appMySQLCLIModeDirect      appMySQLCLIMode = "direct"
)

func appMySQLResolveCLIMode(st *appMySQLStoredConfig) appMySQLCLIMode {
	if st == nil {
		return appMySQLCLIModeUnsupported
	}
	if appMySQLStoredIsPlatformK8s(st) {
		return appMySQLCLIModeK8s
	}
	if st.Mode == AppMySQLExternal && strings.TrimSpace(st.Host) != "" && strings.TrimSpace(st.Username) != "" {
		return appMySQLCLIModeDirect
	}
	return appMySQLCLIModeUnsupported
}

func buildAppMySQLCliInnerShell(st *appMySQLStoredConfig) string {
	dbArg := ""
	if st != nil && strings.TrimSpace(st.DefaultSchema) != "" {
		dbArg = " --database=" + shellQuoteSingle(strings.TrimSpace(st.DefaultSchema))
	}
	return fmt.Sprintf(`if ! command -v mysql >/dev/null 2>&1; then echo "mysql client not found in container" >&2; exit 127; fi; if [ -n "$MYSQL_ROOT_PASSWORD" ]; then export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"; fi; exec mysql -h 127.0.0.1 -P 3306 -uroot --default-character-set=utf8mb4%s`, dbArg)
}

func resolveAppMySQLCliPodName(ctx context.Context, k8s *kubernetes.Clientset, st *appMySQLStoredConfig) (string, error) {
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	sel := labels.Set(appMySQLLabels(base)).AsSelector()
	return firstRunningPodName(ctx, k8s, ns, sel)
}

func handleAppMySQLCLIExecWS(c *gin.Context, app *ServerApp) {
	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("mysql-cli WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		writeWebSocketTerminalError(conn, "无效 MySQL 实例 ID")
		return
	}
	metaDB := app.MySQLDB()
	if metaDB == nil {
		writeWebSocketTerminalError(conn, "MySQL 元数据存储未连接，无法读取实例配置")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	row, err := appMySQLGetByID(ctx, metaDB, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeWebSocketTerminalError(conn, "未找到 MySQL 实例")
			return
		}
		writeWebSocketTerminalError(conn, err.Error())
		return
	}
	if !appMySQLRowVisibleForUser(c, row) {
		writeWebSocketTerminalError(conn, "未找到 MySQL 实例")
		return
	}
	var st appMySQLStoredConfig
	if err := json.Unmarshal([]byte(row.ConfigJSON), &st); err != nil {
		writeWebSocketTerminalError(conn, "MySQL 实例配置解析失败: "+err.Error())
		return
	}

	switch appMySQLResolveCLIMode(&st) {
	case appMySQLCLIModeDirect:
		runAppMySQLDirectCLI(c.Request.Context(), conn, app, &st)
		return
	case appMySQLCLIModeK8s:
		// Continue below.
	default:
		writeWebSocketTerminalError(conn, "MySQL 实例缺少可连接地址，无法打开 mysql CLI")
		return
	}

	k8s := app.K8s()
	restCfg := app.K8sREST()
	if k8s == nil || restCfg == nil {
		writeWebSocketTerminalError(conn, "K8s 未连接：请先完成初始化，或检查平台服务端的 Kubernetes 连接配置")
		return
	}
	podName, err := resolveAppMySQLCliPodName(ctx, k8s, &st)
	if err != nil {
		writeWebSocketTerminalError(conn, err.Error())
		return
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	cmd := []string{"/bin/sh", "-c", buildAppMySQLCliInnerShell(&st)}

	if err := StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, "mysql", cmd, true); err != nil {
		// StreamK8sPodExecTTY 已写入终端
	}
}

func runAppMySQLDirectCLI(ctx context.Context, ws *websocket.Conn, app *ServerApp, st *appMySQLStoredConfig) {
	openCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	db, closeDB, err := openAppMySQLDB(openCtx, app.Cfg(), st)
	cancel()
	if err != nil {
		writeWebSocketTerminalError(ws, "MySQL 连接失败: "+err.Error())
		return
	}
	defer closeDB()

	connCtx, connCancel := context.WithTimeout(ctx, 15*time.Second)
	sqlConn, err := db.Conn(connCtx)
	connCancel()
	if err != nil {
		writeWebSocketTerminalError(ws, "MySQL 会话创建失败: "+err.Error())
		return
	}
	defer sqlConn.Close()

	session := &appMySQLDirectCLISession{conn: sqlConn}
	intro := "EasyPanel mysql CLI (platform direct)\r\n"
	runDirectCLITerminal(ctx, ws, "mysql> ", intro, session.execute)
}

type appMySQLDirectCLISession struct {
	conn    *sql.Conn
	pending []string
}

func (s *appMySQLDirectCLISession) execute(parent context.Context, line string) directCLIResult {
	trimmed := strings.TrimSpace(line)
	if len(s.pending) == 0 {
		switch strings.ToLower(trimmed) {
		case "":
			return directCLIResult{Prompt: "mysql> "}
		case "quit", "exit", "\\q":
			return directCLIResult{Output: "Bye\r\n", Close: true}
		case "clear":
			return directCLIResult{Output: "\x1b[2J\x1b[H", Prompt: "mysql> "}
		}
	}
	s.pending = append(s.pending, line)
	stmt := strings.TrimSpace(strings.Join(s.pending, "\n"))
	if !appMySQLCLIStatementReady(stmt) {
		return directCLIResult{Prompt: "    -> "}
	}
	s.pending = s.pending[:0]
	stmt = appMySQLCLIStripTerminator(stmt)
	if strings.TrimSpace(stmt) == "" {
		return directCLIResult{Prompt: "mysql> "}
	}

	ctx, cancel := context.WithTimeout(parent, 60*time.Second)
	defer cancel()
	out, err := s.executeSQL(ctx, stmt)
	if err != nil {
		return directCLIResult{Output: "ERROR: " + err.Error() + "\r\n", Prompt: "mysql> "}
	}
	return directCLIResult{Output: out, Prompt: "mysql> "}
}

func (s *appMySQLDirectCLISession) executeSQL(ctx context.Context, stmt string) (string, error) {
	start := time.Now()
	switch appMySQLLeadingKeyword(stmt) {
	case "select", "show", "describe", "desc", "explain", "with":
		rows, err := s.conn.QueryContext(ctx, stmt)
		if err != nil {
			return "", err
		}
		defer rows.Close()
		return formatMySQLCLIQueryRows(rows, time.Since(start))
	default:
		res, err := s.conn.ExecContext(ctx, stmt)
		if err != nil {
			return "", err
		}
		affected, _ := res.RowsAffected()
		return fmt.Sprintf("Query OK, %d %s affected (%.2f sec)\r\n", affected, appMySQLCLIRowWord(affected), time.Since(start).Seconds()), nil
	}
}

func appMySQLCLIStatementReady(stmt string) bool {
	s := strings.TrimSpace(stmt)
	if s == "" {
		return true
	}
	lower := strings.ToLower(s)
	return strings.HasSuffix(s, ";") || strings.HasSuffix(lower, "\\g") || strings.HasSuffix(s, "\\G")
}

func appMySQLCLIStripTerminator(stmt string) string {
	s := strings.TrimSpace(stmt)
	lower := strings.ToLower(s)
	switch {
	case strings.HasSuffix(s, ";"):
		return strings.TrimSpace(strings.TrimSuffix(s, ";"))
	case strings.HasSuffix(lower, "\\g"):
		return strings.TrimSpace(s[:len(s)-2])
	default:
		return s
	}
}

func formatMySQLCLIQueryRows(rows *sql.Rows, elapsed time.Duration) (string, error) {
	cols, err := rows.Columns()
	if err != nil {
		return "", err
	}
	var data [][]string
	for rows.Next() {
		vals := make([]sql.NullString, len(cols))
		scan := make([]interface{}, len(cols))
		for i := range vals {
			scan[i] = &vals[i]
		}
		if err := rows.Scan(scan...); err != nil {
			return "", err
		}
		row := make([]string, len(cols))
		for i, v := range vals {
			if v.Valid {
				row[i] = v.String
			} else {
				row[i] = "NULL"
			}
		}
		data = append(data, row)
		if len(data) >= 1000 {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	out := formatMySQLCLITable(cols, data)
	out = strings.TrimRight(out, "\r\n")
	if len(data) >= 1000 {
		out += "\r\nResult truncated at 1000 rows"
	}
	out += fmt.Sprintf(" (%.2f sec)\r\n", elapsed.Seconds())
	return out, nil
}

func formatMySQLCLITable(cols []string, rows [][]string) string {
	widths := make([]int, len(cols))
	for i, col := range cols {
		widths[i] = len(col)
	}
	for _, row := range rows {
		for i, val := range row {
			if i < len(widths) && len(val) > widths[i] {
				widths[i] = len(val)
			}
		}
	}
	border := func() string {
		var b strings.Builder
		b.WriteString("+")
		for _, w := range widths {
			b.WriteString(strings.Repeat("-", w+2))
			b.WriteString("+")
		}
		b.WriteString("\r\n")
		return b.String()
	}
	rowLine := func(vals []string) string {
		var b strings.Builder
		b.WriteString("|")
		for i, w := range widths {
			val := ""
			if i < len(vals) {
				val = vals[i]
			}
			b.WriteString(" ")
			b.WriteString(val)
			b.WriteString(strings.Repeat(" ", w-len(val)))
			b.WriteString(" |")
		}
		b.WriteString("\r\n")
		return b.String()
	}

	var b strings.Builder
	if len(cols) > 0 {
		b.WriteString(border())
		b.WriteString(rowLine(cols))
		b.WriteString(border())
		for _, row := range rows {
			b.WriteString(rowLine(row))
		}
		b.WriteString(border())
	}
	b.WriteString(fmt.Sprintf("%d %s in set", len(rows), appMySQLCLIRowWord(int64(len(rows)))))
	return b.String()
}

func appMySQLCLIRowWord(n int64) string {
	if n == 1 {
		return "row"
	}
	return "rows"
}
