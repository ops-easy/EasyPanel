package controller

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ops-easy/EasyPanel/backend/common/appctx"
)

type dnsScheduledExecution struct {
	Action        string
	Message       string
	RecordChanged bool
	RecordDeleted bool
}

func dnsApplyScheduledTask(ctx context.Context, provider DnsProviderClient, domain string, task DnsScheduledTask, record DnsRecord) (dnsScheduledExecution, DnsRecord, error) {
	action := strings.ToLower(strings.TrimSpace(task.Action))
	if action == "" {
		action = "modify"
	}
	result := dnsScheduledExecution{Action: action}
	switch action {
	case "modify":
		newValue := strings.TrimSpace(task.NewValue)
		if newValue == "" {
			return result, record, errors.New("新记录值不能为空")
		}
		updated := record
		updated.Value = newValue
		if provider == nil {
			return result, record, errors.New("DNS 服务商客户端未就绪")
		}
		if err := provider.UpdateRecord(ctx, domain, dnsProviderRecordFromDNSRecord(updated)); err != nil {
			return result, record, err
		}
		result.RecordChanged = true
		result.Message = fmt.Sprintf("已修改解析记录 %s: %s -> %s", record.ID, record.Value, updated.Value)
		return result, updated, nil
	case "pause":
		if provider == nil {
			return result, record, errors.New("DNS 服务商客户端未就绪")
		}
		if err := provider.SetStatus(ctx, domain, record.ID, false); err != nil {
			return result, record, err
		}
		updated := record
		updated.Status = 0
		result.RecordChanged = true
		result.Message = "已暂停解析记录 " + record.ID
		return result, updated, nil
	case "enable":
		if provider == nil {
			return result, record, errors.New("DNS 服务商客户端未就绪")
		}
		if err := provider.SetStatus(ctx, domain, record.ID, true); err != nil {
			return result, record, err
		}
		updated := record
		updated.Status = 1
		result.RecordChanged = true
		result.Message = "已启用解析记录 " + record.ID
		return result, updated, nil
	case "delete":
		if provider == nil {
			return result, record, errors.New("DNS 服务商客户端未就绪")
		}
		if err := provider.DeleteRecord(ctx, domain, record.ID); err != nil {
			return result, record, err
		}
		result.RecordDeleted = true
		result.Message = "已删除解析记录 " + record.ID
		return result, record, nil
	default:
		return result, record, errors.New("不支持的定时任务动作: " + action)
	}
}

func dnsResolveScheduledTarget(ctx context.Context, db *sql.DB, task DnsScheduledTask) (*DnsDomain, DnsProviderClient, *DnsRecord, error) {
	recordID := strings.TrimSpace(task.RecordID)
	if recordID == "" {
		return nil, nil, nil, errors.New("定时任务需要明确解析记录 ID，请先同步记录后选择目标")
	}
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
	for i := range records {
		if records[i].ID == recordID {
			r := records[i]
			return domain, client, &r, nil
		}
	}
	return nil, nil, nil, fmt.Errorf("解析记录 %s 不存在，请先同步 DNS 记录", recordID)
}

func dnsExecuteScheduledTask(ctx context.Context, db *sql.DB, task DnsScheduledTask) error {
	domain, provider, record, err := dnsResolveScheduledTarget(ctx, db, task)
	if err != nil {
		_ = dnsScheduledMarkResult(ctx, db, task.ID, "error", err.Error())
		return err
	}
	result, updatedRecord, err := dnsApplyScheduledTask(ctx, provider, domain.Name, task, *record)
	if err != nil {
		_ = dnsScheduledMarkResult(ctx, db, task.ID, "error", err.Error())
		return err
	}
	if result.RecordDeleted {
		if err := dnsRecordDelete(ctx, db, record.ID, task.DomainID); err != nil {
			_ = dnsScheduledMarkResult(ctx, db, task.ID, "error", err.Error())
			return err
		}
	} else if result.RecordChanged {
		if err := dnsRecordUpsert(ctx, db, updatedRecord); err != nil {
			_ = dnsScheduledMarkResult(ctx, db, task.ID, "error", err.Error())
			return err
		}
	}
	return dnsScheduledMarkResult(ctx, db, task.ID, "done", result.Message)
}

func dnsScheduledTaskDue(task DnsScheduledTask, now time.Time) bool {
	return strings.EqualFold(strings.TrimSpace(task.Status), "pending") && !task.ScheduledAt.After(now)
}

func StartDnsScheduledWorker(ctx context.Context, app *appctx.ServerApp) {
	interval := dnsScheduledWorkerInterval()
	if interval <= 0 {
		log.Println("dns-scheduled: 后台轮询已关闭")
		return
	}
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		log.Printf("dns-scheduled: 后台轮询已启动（tick=%s）", interval)
		for {
			select {
			case <-ctx.Done():
				log.Println("dns-scheduled: 后台轮询已停止")
				return
			case <-ticker.C:
				dnsTickScheduled(ctx, app)
			}
		}
	}()
}

func dnsScheduledWorkerInterval() time.Duration {
	raw := strings.TrimSpace(os.Getenv("EASYPANEL_DNS_SCHEDULED_TICK_SECONDS"))
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

func dnsTickScheduled(ctx context.Context, app *appctx.ServerApp) {
	if app == nil {
		return
	}
	db := app.MySQLDB()
	if db == nil {
		return
	}
	tasks, err := dnsScheduledList(ctx, db)
	if err != nil {
		log.Printf("dns-scheduled: 读取任务失败: %v", err)
		return
	}
	now := time.Now()
	for _, task := range tasks {
		if !dnsScheduledTaskDue(task, now) {
			continue
		}
		taskCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		err := dnsExecuteScheduledTask(taskCtx, db, task)
		cancel()
		if err != nil {
			log.Printf("dns-scheduled: 任务 %d 执行失败: %v", task.ID, err)
		}
	}
}
