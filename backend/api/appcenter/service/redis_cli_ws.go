package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"reflect"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/kubernetes"
)

type redisDoer interface {
	Do(context.Context, ...interface{}) *redis.Cmd
}

type redisConnDoer struct {
	conn *redis.Conn
}

func (d redisConnDoer) Do(ctx context.Context, args ...interface{}) *redis.Cmd {
	cmd := redis.NewCmd(ctx, args...)
	if d.conn == nil {
		cmd.SetErr(errors.New("redis connection is not initialized"))
		return cmd
	}
	_ = d.conn.Process(ctx, cmd)
	return cmd
}

type appRedisCLIMode string

const (
	appRedisCLIModeUnsupported appRedisCLIMode = "unsupported"
	appRedisCLIModeK8s         appRedisCLIMode = "k8s"
	appRedisCLIModeDirect      appRedisCLIMode = "direct"
)

func appRedisResolveCLIMode(st *appRedisStoredConfig) appRedisCLIMode {
	if st == nil {
		return appRedisCLIModeUnsupported
	}
	if appRedisStoredIsPlatformK8s(st) && strings.TrimSpace(st.K8sBaseName) != "" {
		return appRedisCLIModeK8s
	}
	switch st.Mode {
	case AppRedisStandalone:
		if strings.TrimSpace(st.Addr) != "" {
			return appRedisCLIModeDirect
		}
	case AppRedisReplication:
		if strings.TrimSpace(st.MasterAddr) != "" {
			return appRedisCLIModeDirect
		}
	case AppRedisSentinel:
		if strings.TrimSpace(st.MasterName) != "" && len(st.SentinelAddrs) > 0 {
			return appRedisCLIModeDirect
		}
	case AppRedisCluster:
		if len(st.ClusterAddrs) > 0 {
			return appRedisCLIModeDirect
		}
	}
	return appRedisCLIModeUnsupported
}

func buildRedisCliInnerShell(st *appRedisStoredConfig) string {
	top := strings.TrimSpace(st.K8sTopology)
	if top == "" {
		top = "standalone"
	}
	extra := ""
	if top == "cluster" {
		extra = " -c"
	}
	// Pod 内已有 REDIS_PASSWORD；用 REDISCLI_AUTH 供 redis-cli 使用，命令行不出现 -a 与明文
	return fmt.Sprintf(`if [ -n "$REDIS_PASSWORD" ]; then export REDISCLI_AUTH="$REDIS_PASSWORD"; fi; exec redis-cli%s`, extra)
}

func resolveRedisCliPodName(ctx context.Context, k8s *kubernetes.Clientset, st *appRedisStoredConfig) (string, error) {
	ns := strings.TrimSpace(st.K8sNamespace)
	base := strings.TrimSpace(st.K8sBaseName)
	top := strings.TrimSpace(st.K8sTopology)
	if top == "" {
		top = "standalone"
	}
	switch top {
	case "cluster":
		return base + "-cluster-0", nil
	case "sentinel":
		sel := labels.Set(sentinelSelector(base, "master")).AsSelector()
		return firstRunningPodName(ctx, k8s, ns, sel)
	default:
		sel := labels.Set(map[string]string{"app": base}).AsSelector()
		return firstRunningPodName(ctx, k8s, ns, sel)
	}
}

func firstRunningPodName(ctx context.Context, k8s *kubernetes.Clientset, ns string, sel labels.Selector) (string, error) {
	list, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{LabelSelector: sel.String()})
	if err != nil {
		return "", err
	}
	for i := range list.Items {
		p := &list.Items[i]
		if p.Status.Phase == corev1.PodRunning {
			return p.Name, nil
		}
	}
	if len(list.Items) > 0 {
		return list.Items[0].Name, nil
	}
	return "", fmt.Errorf("未找到 Pod（请确认工作负载已就绪）")
}

func handleAppRedisRedisCLIExecWS(c *gin.Context, app *ServerApp) {
	conn, err := execUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("redis-cli WebSocket 升级失败: %v", err)
		return
	}
	defer conn.Close()

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		writeWebSocketTerminalError(conn, "无效 Redis 实例 ID")
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()
	st, err := loadStoredForIDIfVisible(ctx, c, app, id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeWebSocketTerminalError(conn, "未找到 Redis 实例")
			return
		}
		writeWebSocketTerminalError(conn, err.Error())
		return
	}

	switch appRedisResolveCLIMode(st) {
	case appRedisCLIModeDirect:
		runAppRedisDirectCLI(c.Request.Context(), conn, app, st)
		return
	case appRedisCLIModeK8s:
		// Continue below.
	default:
		writeWebSocketTerminalError(conn, "Redis 实例缺少可连接地址，无法打开 redis-cli")
		return
	}

	k8s := app.K8s()
	restCfg := app.K8sREST()
	if k8s == nil || restCfg == nil {
		writeWebSocketTerminalError(conn, "K8s 未连接：请先完成初始化，或检查平台服务端的 Kubernetes 连接配置")
		return
	}
	podName, err := resolveRedisCliPodName(ctx, k8s, st)
	if err != nil {
		writeWebSocketTerminalError(conn, err.Error())
		return
	}
	ns := strings.TrimSpace(st.K8sNamespace)
	inner := buildRedisCliInnerShell(st)
	cmd := []string{"/bin/sh", "-c", inner}

	if err := StreamK8sPodExecTTY(conn, k8s, restCfg, ns, podName, "redis", cmd, true); err != nil {
		// StreamK8sPodExecTTY 已写入终端
	}
}

func runAppRedisDirectCLI(ctx context.Context, conn *websocket.Conn, app *ServerApp, st *appRedisStoredConfig) {
	openCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	rdb, closeFn, err := openAppRedisClient(openCtx, app.Cfg(), st)
	cancel()
	if err != nil {
		writeWebSocketTerminalError(conn, "Redis 连接失败: "+err.Error())
		return
	}
	defer closeFn()
	doer, ok := rdb.(redisDoer)
	if !ok {
		writeWebSocketTerminalError(conn, "Redis 客户端不支持直连 CLI 命令执行")
		return
	}
	if client, ok := rdb.(*redis.Client); ok {
		dedicated := client.Conn()
		defer dedicated.Close()
		doer = redisConnDoer{conn: dedicated}
	}

	prompt := "redis> "
	intro := "EasyPanel redis-cli (platform direct)\r\n"
	runDirectCLITerminal(ctx, conn, prompt, intro, func(parent context.Context, line string) directCLIResult {
		return executeRedisDirectCLILine(parent, doer, line, prompt)
	})
}

func executeRedisDirectCLILine(parent context.Context, rdb redisDoer, line, prompt string) directCLIResult {
	line = strings.TrimSpace(line)
	if line == "" {
		return directCLIResult{Prompt: prompt}
	}
	switch strings.ToLower(line) {
	case "quit", "exit":
		return directCLIResult{Output: "OK\r\n", Close: true}
	case "clear":
		return directCLIResult{Output: "\x1b[2J\x1b[H", Prompt: prompt}
	}
	args, err := parseRedisCLIArgs(line)
	if err != nil {
		return directCLIResult{Output: "(error) " + err.Error() + "\r\n", Prompt: prompt}
	}
	if len(args) == 0 {
		return directCLIResult{Prompt: prompt}
	}
	cmdArgs := make([]interface{}, 0, len(args))
	for _, arg := range args {
		cmdArgs = append(cmdArgs, arg)
	}
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	val, err := rdb.Do(ctx, cmdArgs...).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return directCLIResult{Output: "(nil)\r\n", Prompt: prompt}
		}
		return directCLIResult{Output: "(error) " + err.Error() + "\r\n", Prompt: prompt}
	}
	return directCLIResult{Output: formatRedisCLIValue(val), Prompt: prompt}
}

func parseRedisCLIArgs(line string) ([]string, error) {
	var out []string
	var cur strings.Builder
	var quote rune
	escaped := false
	hadToken := false
	for _, r := range line {
		if escaped {
			cur.WriteRune(r)
			hadToken = true
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			hadToken = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
				hadToken = true
				continue
			}
			cur.WriteRune(r)
			hadToken = true
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			hadToken = true
			continue
		}
		if unicode.IsSpace(r) {
			if hadToken {
				out = append(out, cur.String())
				cur.Reset()
				hadToken = false
			}
			continue
		}
		cur.WriteRune(r)
		hadToken = true
	}
	if escaped {
		cur.WriteRune('\\')
	}
	if quote != 0 {
		return nil, fmt.Errorf("unterminated quote")
	}
	if hadToken {
		out = append(out, cur.String())
	}
	return out, nil
}

func formatRedisCLIValue(v interface{}) string {
	if v == nil {
		return "(nil)\r\n"
	}
	switch x := v.(type) {
	case string:
		return x + "\r\n"
	case []byte:
		return string(x) + "\r\n"
	case int:
		return fmt.Sprintf("(integer) %d\r\n", x)
	case int64:
		return fmt.Sprintf("(integer) %d\r\n", x)
	case uint64:
		return fmt.Sprintf("(integer) %d\r\n", x)
	case bool:
		if x {
			return "(integer) 1\r\n"
		}
		return "(integer) 0\r\n"
	case []interface{}:
		if len(x) == 0 {
			return "(empty array)\r\n"
		}
		var b strings.Builder
		for i, item := range x {
			b.WriteString(fmt.Sprintf("%d) %s", i+1, strings.TrimRight(formatRedisCLIValue(item), "\r\n")))
			b.WriteString("\r\n")
		}
		return b.String()
	case []string:
		if len(x) == 0 {
			return "(empty array)\r\n"
		}
		var b strings.Builder
		for i, item := range x {
			b.WriteString(fmt.Sprintf("%d) %s\r\n", i+1, item))
		}
		return b.String()
	default:
		rv := reflect.ValueOf(v)
		if rv.IsValid() && rv.Kind() == reflect.Slice {
			var b strings.Builder
			for i := 0; i < rv.Len(); i++ {
				b.WriteString(fmt.Sprintf("%d) %v\r\n", i+1, rv.Index(i).Interface()))
			}
			if b.Len() > 0 {
				return b.String()
			}
		}
		return fmt.Sprintf("%v\r\n", v)
	}
}
