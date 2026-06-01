package controller

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/ops-easy/EasyPanel/backend/common/appctx"
)

type dnsFailoverTransition struct {
	OK            bool
	LastStatus    string
	ErrorCount    int
	Action        string
	OldValue      string
	NewValue      string
	Message       string
	RecordChanged bool
}

func dnsDoHealthCheck(ctx context.Context, task *DnsFailoverTask) (bool, string) {
	if task == nil {
		return false, "监测任务为空"
	}
	checkType := strings.ToLower(strings.TrimSpace(task.CheckType))
	if checkType == "" {
		checkType = "http"
	}
	switch checkType {
	case "http", "https":
		return dnsDoHTTPHealthCheck(ctx, task, checkType)
	case "tcp":
		return dnsDoTCPHealthCheck(ctx, task)
	case "ping":
		return dnsDoPingHealthCheck(ctx, task)
	default:
		return false, "不支持的检测类型: " + checkType
	}
}

func dnsDoHTTPHealthCheck(ctx context.Context, task *DnsFailoverTask, scheme string) (bool, string) {
	target := strings.TrimSpace(task.CheckTarget)
	if target == "" {
		return false, "检测目标不能为空"
	}
	u, err := dnsFailoverHTTPURL(target, scheme, task.CheckPort, task.CheckPath)
	if err != nil {
		return false, err.Error()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return false, err.Error()
	}
	client := &http.Client{Timeout: dnsFailoverTimeout(task.CheckTimeout)}
	resp, err := client.Do(req)
	if err != nil {
		return false, "HTTP 请求失败: " + err.Error()
	}
	_ = resp.Body.Close()
	if resp.StatusCode >= 400 {
		return false, "HTTP 状态码: " + strconv.Itoa(resp.StatusCode)
	}
	return true, "HTTP 检测成功，状态码: " + strconv.Itoa(resp.StatusCode)
}

func dnsDoTCPHealthCheck(ctx context.Context, task *DnsFailoverTask) (bool, string) {
	target := strings.TrimSpace(task.CheckTarget)
	if target == "" {
		return false, "检测目标不能为空"
	}
	port := task.CheckPort
	if port <= 0 || port > 65535 {
		return false, "TCP 检测端口无效"
	}
	addr := dnsJoinHostPort(target, port)
	dialer := net.Dialer{Timeout: dnsFailoverTimeout(task.CheckTimeout)}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return false, "TCP 连接失败: " + err.Error()
	}
	_ = conn.Close()
	return true, "TCP 检测成功: " + addr
}

func dnsDoPingHealthCheck(ctx context.Context, task *DnsFailoverTask) (bool, string) {
	target, err := dnsFailoverPingTarget(task.CheckTarget)
	if err != nil {
		return false, err.Error()
	}
	timeout := dnsFailoverTimeout(task.CheckTimeout)
	output, err := dnsRunPingCommand(ctx, target, timeout)
	detail := dnsPingOutputSummary(output)
	if err != nil {
		msg := "Ping 检测失败: " + err.Error()
		if detail != "" {
			msg += "；" + detail
		}
		return false, msg
	}
	msg := "Ping 检测成功: " + target
	if detail != "" {
		msg += "；" + detail
	}
	return true, msg
}

func dnsFailoverPingTarget(raw string) (string, error) {
	target := strings.TrimSpace(raw)
	if target == "" {
		return "", errors.New("Ping 检测目标不能为空")
	}
	if strings.Contains(target, "://") {
		u, err := url.Parse(target)
		if err != nil {
			return "", err
		}
		target = u.Hostname()
		if target == "" {
			return "", errors.New("Ping 检测目标缺少主机")
		}
		return target, nil
	}
	if strings.ContainsAny(target, `/\`) {
		return "", errors.New("Ping 检测目标应为 IP 或域名，不包含路径")
	}
	if host, _, err := net.SplitHostPort(target); err == nil {
		target = host
	}
	target = strings.Trim(target, "[]")
	if target == "" {
		return "", errors.New("Ping 检测目标缺少主机")
	}
	return target, nil
}

func dnsRunPingCommand(ctx context.Context, target string, timeout time.Duration) ([]byte, error) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	pingCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	name, args := dnsPingCommand(target, timeout)
	return exec.CommandContext(pingCtx, name, args...).CombinedOutput()
}

func dnsPingCommand(target string, timeout time.Duration) (string, []string) {
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	timeoutSeconds := int(timeout.Round(time.Second) / time.Second)
	if timeoutSeconds < 1 {
		timeoutSeconds = 1
	}
	if runtime.GOOS == "windows" {
		timeoutMillis := int(timeout / time.Millisecond)
		if timeoutMillis < 1000 {
			timeoutMillis = 1000
		}
		return "ping", []string{"-n", "1", "-w", strconv.Itoa(timeoutMillis), target}
	}
	return "ping", []string{"-c", "1", "-W", strconv.Itoa(timeoutSeconds), target}
}

func dnsPingOutputSummary(output []byte) string {
	for _, line := range strings.Split(strings.ReplaceAll(string(output), "\r\n", "\n"), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			if len(line) > 180 {
				return line[:180] + "..."
			}
			return line
		}
	}
	return ""
}

func dnsFailoverHTTPURL(target, scheme string, port int, checkPath string) (string, error) {
	if strings.Contains(target, "://") {
		u, err := url.Parse(target)
		if err != nil {
			return "", err
		}
		if u.Host == "" {
			return "", errors.New("HTTP 检测目标缺少主机")
		}
		if strings.TrimSpace(checkPath) != "" && strings.TrimSpace(checkPath) != "/" {
			u.Path = dnsNormalizeHTTPPath(checkPath)
		}
		return u.String(), nil
	}
	host := target
	if slash := strings.Index(host, "/"); slash >= 0 {
		host = host[:slash]
	}
	if host == "" {
		return "", errors.New("HTTP 检测目标缺少主机")
	}
	defaultPort := 80
	if scheme == "https" {
		defaultPort = 443
	}
	if port > 0 && port != defaultPort && !dnsHostHasPort(host) {
		host = dnsJoinHostPort(host, port)
	}
	return scheme + "://" + host + dnsNormalizeHTTPPath(checkPath), nil
}

func dnsNormalizeHTTPPath(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return "/"
	}
	if strings.HasPrefix(path, "/") {
		return path
	}
	return "/" + path
}

func dnsHostHasPort(host string) bool {
	if _, _, err := net.SplitHostPort(host); err == nil {
		return true
	}
	return strings.Count(host, ":") == 1 && strings.Contains(host, ":")
}

func dnsJoinHostPort(host string, port int) string {
	if dnsHostHasPort(host) {
		return host
	}
	return net.JoinHostPort(host, strconv.Itoa(port))
}

func dnsFailoverTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		seconds = 10
	}
	if seconds > 120 {
		seconds = 120
	}
	return time.Duration(seconds) * time.Second
}

func dnsApplyFailoverTransition(ctx context.Context, provider DnsProviderClient, domain string, task DnsFailoverTask, record DnsRecord, ok bool, checkMsg string) (dnsFailoverTransition, DnsRecord, error) {
	result := dnsFailoverTransition{OK: ok}
	if ok {
		result.LastStatus = "ok"
		result.ErrorCount = 0
		result.Action = "check_ok"
		result.Message = strings.TrimSpace(checkMsg)
		if result.Message == "" {
			result.Message = "检测成功"
		}
		if strings.TrimSpace(task.OriginalValue) != "" &&
			strings.TrimSpace(task.FailoverValue) != "" &&
			strings.TrimSpace(record.Value) == strings.TrimSpace(task.FailoverValue) &&
			strings.TrimSpace(task.OriginalValue) != strings.TrimSpace(task.FailoverValue) {
			updated := record
			updated.Value = strings.TrimSpace(task.OriginalValue)
			if provider == nil {
				return result, record, errors.New("DNS 服务商客户端未就绪，无法恢复解析记录")
			}
			if err := provider.UpdateRecord(ctx, domain, dnsProviderRecordFromDNSRecord(updated)); err != nil {
				return result, record, err
			}
			result.Action = "recover"
			result.OldValue = record.Value
			result.NewValue = updated.Value
			result.RecordChanged = true
			result.Message += "；已恢复 DNS 解析到原始值"
			return result, updated, nil
		}
		result.Message += "；解析保持正常"
		return result, record, nil
	}

	maxErrors := task.MaxErrors
	if maxErrors <= 0 {
		maxErrors = 1
	}
	result.LastStatus = "error"
	result.ErrorCount = task.ErrorCount + 1
	result.Action = "check_error"
	result.Message = strings.TrimSpace(checkMsg)
	if result.Message == "" {
		result.Message = "检测失败"
	}
	if result.ErrorCount < maxErrors {
		result.Message += fmt.Sprintf("；连续失败 %d/%d，尚未切换", result.ErrorCount, maxErrors)
		return result, record, nil
	}
	failoverValue := strings.TrimSpace(task.FailoverValue)
	if failoverValue == "" {
		return result, record, errors.New("故障切换值不能为空")
	}
	if strings.TrimSpace(record.Value) == failoverValue {
		result.Action = "failover_hold"
		result.Message += "；已处于备用解析值"
		return result, record, nil
	}
	updated := record
	updated.Value = failoverValue
	if provider == nil {
		return result, record, errors.New("DNS 服务商客户端未就绪，无法切换解析记录")
	}
	if err := provider.UpdateRecord(ctx, domain, dnsProviderRecordFromDNSRecord(updated)); err != nil {
		return result, record, err
	}
	result.Action = "failover"
	result.OldValue = record.Value
	result.NewValue = updated.Value
	result.RecordChanged = true
	result.Message += "；已切换 DNS 解析到备用值"
	return result, updated, nil
}

func dnsProviderRecordFromDNSRecord(r DnsRecord) DnsProviderRecord {
	return DnsProviderRecord{
		ID:         r.ID,
		RecordType: r.RecordType,
		Host:       r.Host,
		Line:       r.Line,
		Value:      r.Value,
		TTL:        r.TTL,
		MxPriority: r.MxPriority,
		Status:     r.Status,
	}
}

func dnsSelectFailoverRecord(task DnsFailoverTask, records []DnsRecord) (*DnsRecord, error) {
	recordID := strings.TrimSpace(task.RecordID)
	if recordID != "" {
		for i := range records {
			if records[i].ID == recordID {
				r := records[i]
				return &r, nil
			}
		}
		return nil, fmt.Errorf("解析记录 %s 不存在，请先同步 DNS 记录", recordID)
	}
	originalValue := strings.TrimSpace(task.OriginalValue)
	var firstRoot *DnsRecord
	var firstManaged *DnsRecord
	for i := range records {
		r := records[i]
		if r.Status == 0 || !dnsFailoverRecordTypeSupported(r.RecordType) {
			continue
		}
		if originalValue != "" && strings.TrimSpace(r.Value) == originalValue {
			return &r, nil
		}
		if firstRoot == nil && strings.TrimSpace(r.Host) == "@" {
			firstRoot = &r
		}
		if firstManaged == nil {
			firstManaged = &r
		}
	}
	if firstRoot != nil {
		return firstRoot, nil
	}
	if firstManaged != nil {
		return firstManaged, nil
	}
	return nil, errors.New("没有可切换的 A/AAAA/CNAME 解析记录，请先同步或填写记录 ID")
}

func dnsFailoverRecordTypeSupported(recordType string) bool {
	switch strings.ToUpper(strings.TrimSpace(recordType)) {
	case "A", "AAAA", "CNAME":
		return true
	default:
		return false
	}
}

func dnsResolveFailoverTarget(ctx context.Context, db *sql.DB, task DnsFailoverTask) (*DnsDomain, DnsProviderClient, *DnsRecord, error) {
	domain, err := dnsDomainGet(ctx, db, task.DomainID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("域名不存在或不可用: %w", err)
	}
	acc, err := dnsAccountGet(ctx, db, domain.AccountID)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("DNS 服务商账号不可用: %w", err)
	}
	client, err := newDnsProviderClient(acc.Provider, acc.ConfigJSON)
	if err != nil {
		return nil, nil, nil, err
	}
	records, err := dnsRecordListByDomain(ctx, db, task.DomainID)
	if err != nil {
		return nil, nil, nil, err
	}
	record, err := dnsSelectFailoverRecord(task, records)
	if err != nil {
		return nil, nil, nil, err
	}
	return domain, client, record, nil
}

func dnsExecuteFailoverTask(ctx context.Context, db *sql.DB, task DnsFailoverTask) (dnsFailoverTransition, error) {
	ok, msg := dnsDoHealthCheck(ctx, &task)
	domain, provider, record, err := dnsResolveFailoverTarget(ctx, db, task)
	if err != nil {
		status := "ok"
		if !ok {
			status = "error"
		}
		count := task.ErrorCount
		if !ok {
			count++
		}
		_ = dnsFailoverMarkCheck(ctx, db, task.ID, status, count)
		_ = dnsFailoverLogInsert(ctx, db, task.ID, "config_error", "", "", err.Error())
		return dnsFailoverTransition{OK: ok, LastStatus: status, ErrorCount: count, Action: "config_error", Message: err.Error()}, err
	}
	result, updatedRecord, err := dnsApplyFailoverTransition(ctx, provider, domain.Name, task, *record, ok, msg)
	if err != nil {
		_ = dnsFailoverMarkCheck(ctx, db, task.ID, result.LastStatus, result.ErrorCount)
		_ = dnsFailoverLogInsert(ctx, db, task.ID, "transition_error", record.Value, "", err.Error())
		return result, err
	}
	if result.RecordChanged {
		if err := dnsRecordUpsert(ctx, db, updatedRecord); err != nil {
			return result, err
		}
	}
	if err := dnsFailoverMarkCheck(ctx, db, task.ID, result.LastStatus, result.ErrorCount); err != nil {
		return result, err
	}
	_ = dnsFailoverLogInsert(ctx, db, task.ID, result.Action, result.OldValue, result.NewValue, result.Message)
	return result, nil
}

func dnsFailoverTaskDue(task DnsFailoverTask, now time.Time) bool {
	if task.Status != 1 {
		return false
	}
	if task.LastCheckAt == nil {
		return true
	}
	interval := task.CheckInterval
	if interval <= 0 {
		interval = 60
	}
	return !task.LastCheckAt.Add(time.Duration(interval) * time.Second).After(now)
}

func StartDnsFailoverWorker(ctx context.Context, app *appctx.ServerApp) {
	interval := dnsFailoverWorkerInterval()
	if interval <= 0 {
		log.Println("dns-failover: 后台轮询已关闭")
		return
	}
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		log.Printf("dns-failover: 后台轮询已启动（tick=%s）", interval)
		for {
			select {
			case <-ctx.Done():
				log.Println("dns-failover: 后台轮询已停止")
				return
			case <-ticker.C:
				dnsTickFailover(ctx, app)
			}
		}
	}()
}

func dnsFailoverWorkerInterval() time.Duration {
	raw := strings.TrimSpace(os.Getenv("EASYPANEL_DNS_FAILOVER_TICK_SECONDS"))
	if raw == "" {
		return 15 * time.Second
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return 15 * time.Second
	}
	if n == 0 {
		return 0
	}
	if n < 5 {
		n = 5
	}
	return time.Duration(n) * time.Second
}

func dnsTickFailover(ctx context.Context, app *appctx.ServerApp) {
	if app == nil {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		return
	}
	tasks, err := dnsFailoverList(ctx, db)
	if err != nil {
		log.Printf("dns-failover: 读取任务失败: %v", err)
		return
	}
	now := time.Now()
	for _, task := range tasks {
		if !dnsFailoverTaskDue(task, now) {
			continue
		}
		timeout := dnsFailoverTimeout(task.CheckTimeout) + 5*time.Second
		taskCtx, cancel := context.WithTimeout(ctx, timeout)
		result, err := dnsExecuteFailoverTask(taskCtx, db, task)
		cancel()
		if err != nil {
			log.Printf("dns-failover: 任务 %d 执行失败: %v", task.ID, err)
			continue
		}
		if result.Action == "failover" || result.Action == "recover" {
			log.Printf("dns-failover: 任务 %d %s: %s -> %s", task.ID, result.Action, result.OldValue, result.NewValue)
		}
	}
}
