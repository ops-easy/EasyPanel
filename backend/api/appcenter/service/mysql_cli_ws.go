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
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
)

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

	k8s := app.K8s()
	restCfg := app.K8sREST()
	if k8s == nil || restCfg == nil {
		writeWebSocketTerminalError(conn, "K8s 未连接：请先完成初始化，或检查平台服务端的 Kubernetes 连接配置")
		return
	}
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
	if !appMySQLStoredIsPlatformK8s(&st) {
		writeWebSocketTerminalError(conn, "仅 Kubernetes 平台部署的实例支持控制台 mysql CLI")
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
