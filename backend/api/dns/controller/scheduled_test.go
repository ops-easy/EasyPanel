package controller

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestDnsScheduledApplyTaskModifiesPausesEnablesAndDeletesRecord(t *testing.T) {
	provider := &fakeDNSProvider{}
	record := DnsRecord{
		ID:         "record-1",
		DomainID:   7,
		RecordType: "A",
		Host:       "@",
		Value:      "1.1.1.1",
		TTL:        600,
		Status:     1,
	}

	modified, updated, err := dnsApplyScheduledTask(context.Background(), provider, "example.com", DnsScheduledTask{
		ID:       1,
		Action:   "modify",
		NewValue: "2.2.2.2",
	}, record)
	if err != nil {
		t.Fatalf("dnsApplyScheduledTask(modify) error = %v", err)
	}
	if modified.Action != "modify" || !modified.RecordChanged || updated.Value != "2.2.2.2" {
		t.Fatalf("modify result = %#v updated = %#v", modified, updated)
	}
	if len(provider.updated) != 1 || provider.updated[0].record.Value != "2.2.2.2" {
		t.Fatalf("provider updates = %#v", provider.updated)
	}

	paused, updated, err := dnsApplyScheduledTask(context.Background(), provider, "example.com", DnsScheduledTask{ID: 2, Action: "pause"}, updated)
	if err != nil {
		t.Fatalf("dnsApplyScheduledTask(pause) error = %v", err)
	}
	if paused.Action != "pause" || !paused.RecordChanged || updated.Status != 0 {
		t.Fatalf("pause result = %#v updated = %#v", paused, updated)
	}
	if len(provider.statuses) != 1 || provider.statuses[0].enabled {
		t.Fatalf("provider statuses after pause = %#v", provider.statuses)
	}

	enabled, updated, err := dnsApplyScheduledTask(context.Background(), provider, "example.com", DnsScheduledTask{ID: 3, Action: "enable"}, updated)
	if err != nil {
		t.Fatalf("dnsApplyScheduledTask(enable) error = %v", err)
	}
	if enabled.Action != "enable" || !enabled.RecordChanged || updated.Status != 1 {
		t.Fatalf("enable result = %#v updated = %#v", enabled, updated)
	}
	if len(provider.statuses) != 2 || !provider.statuses[1].enabled {
		t.Fatalf("provider statuses after enable = %#v", provider.statuses)
	}

	deleted, _, err := dnsApplyScheduledTask(context.Background(), provider, "example.com", DnsScheduledTask{ID: 4, Action: "delete"}, updated)
	if err != nil {
		t.Fatalf("dnsApplyScheduledTask(delete) error = %v", err)
	}
	if deleted.Action != "delete" || !deleted.RecordDeleted {
		t.Fatalf("delete result = %#v", deleted)
	}
	if len(provider.deleted) != 1 || provider.deleted[0] != "record-1" {
		t.Fatalf("provider deleted = %#v", provider.deleted)
	}
}

func TestDnsScheduledApplyTaskValidatesModifyValue(t *testing.T) {
	_, _, err := dnsApplyScheduledTask(context.Background(), &fakeDNSProvider{}, "example.com", DnsScheduledTask{
		Action: "modify",
	}, DnsRecord{ID: "record-1", RecordType: "A", Host: "@", Value: "1.1.1.1", TTL: 600, Status: 1})
	if err == nil {
		t.Fatalf("dnsApplyScheduledTask(modify without value) returned nil error")
	}
	if !strings.Contains(err.Error(), "新记录值不能为空") {
		t.Fatalf("error = %v", err)
	}
}

func TestDnsScheduledTaskDueRequiresPendingAndPastTime(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	if dnsScheduledTaskDue(DnsScheduledTask{Status: "done", ScheduledAt: now.Add(-time.Minute)}, now) {
		t.Fatalf("done task should not be due")
	}
	if dnsScheduledTaskDue(DnsScheduledTask{Status: "pending", ScheduledAt: now.Add(time.Minute)}, now) {
		t.Fatalf("future pending task should not be due")
	}
	if !dnsScheduledTaskDue(DnsScheduledTask{Status: "pending", ScheduledAt: now}, now) {
		t.Fatalf("pending task at current time should be due")
	}
}
