package controller

import (
	"context"
	"net"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDnsFailoverTCPHealthCheckConnectsToTarget(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() {
		conn, err := ln.Accept()
		if err == nil {
			_ = conn.Close()
		}
	}()

	_, portText, err := net.SplitHostPort(ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(portText)
	if err != nil {
		t.Fatal(err)
	}
	ok, msg := dnsDoHealthCheck(context.Background(), &DnsFailoverTask{
		CheckType:    "tcp",
		CheckTarget:  "127.0.0.1",
		CheckPort:    port,
		CheckTimeout: 1,
	})
	if !ok {
		t.Fatalf("dnsDoHealthCheck(tcp) ok = false, msg = %q", msg)
	}
	if !strings.Contains(msg, "TCP") {
		t.Fatalf("dnsDoHealthCheck(tcp) msg = %q, want TCP detail", msg)
	}
}

func TestDnsFailoverPingHealthCheckConnectsToLoopback(t *testing.T) {
	if _, err := exec.LookPath("ping"); err != nil {
		t.Skip("ping command is not available in this test environment")
	}
	ok, msg := dnsDoHealthCheck(context.Background(), &DnsFailoverTask{
		CheckType:    "ping",
		CheckTarget:  "127.0.0.1",
		CheckTimeout: 1,
	})
	if !ok {
		t.Fatalf("dnsDoHealthCheck(ping) ok = false, msg = %q", msg)
	}
	if !strings.Contains(msg, "Ping") {
		t.Fatalf("dnsDoHealthCheck(ping) msg = %q, want Ping detail", msg)
	}
}

func TestDnsFailoverTransitionSwitchesAfterMaxErrorsAndRestoresOnRecovery(t *testing.T) {
	provider := &fakeDNSProvider{}
	record := DnsRecord{
		ID:         "record-1",
		DomainID:   7,
		RecordType: "A",
		Host:       "@",
		Line:       "",
		Value:      "1.1.1.1",
		TTL:        600,
		Status:     1,
	}
	task := DnsFailoverTask{
		ID:            3,
		DomainID:      7,
		RecordID:      "record-1",
		MaxErrors:     2,
		ErrorCount:    1,
		FailoverValue: "2.2.2.2",
		OriginalValue: "1.1.1.1",
		Status:        1,
	}

	failover, updated, err := dnsApplyFailoverTransition(context.Background(), provider, "example.com", task, record, false, "HTTP 状态码: 500")
	if err != nil {
		t.Fatalf("dnsApplyFailoverTransition(failure) error = %v", err)
	}
	if failover.Action != "failover" {
		t.Fatalf("failure action = %q, want failover", failover.Action)
	}
	if failover.ErrorCount != 2 || failover.LastStatus != "error" {
		t.Fatalf("failure state = count %d status %q", failover.ErrorCount, failover.LastStatus)
	}
	if updated.Value != "2.2.2.2" {
		t.Fatalf("updated record value = %q, want failover value", updated.Value)
	}
	if len(provider.updated) != 1 || provider.updated[0].record.Value != "2.2.2.2" {
		t.Fatalf("provider updates after failover = %#v", provider.updated)
	}

	task.ErrorCount = failover.ErrorCount
	record.Value = updated.Value
	recovery, restored, err := dnsApplyFailoverTransition(context.Background(), provider, "example.com", task, record, true, "TCP 检测成功")
	if err != nil {
		t.Fatalf("dnsApplyFailoverTransition(recovery) error = %v", err)
	}
	if recovery.Action != "recover" {
		t.Fatalf("recovery action = %q, want recover", recovery.Action)
	}
	if recovery.ErrorCount != 0 || recovery.LastStatus != "ok" {
		t.Fatalf("recovery state = count %d status %q", recovery.ErrorCount, recovery.LastStatus)
	}
	if restored.Value != "1.1.1.1" {
		t.Fatalf("restored record value = %q, want original value", restored.Value)
	}
	if len(provider.updated) != 2 || provider.updated[1].record.Value != "1.1.1.1" {
		t.Fatalf("provider updates after recovery = %#v", provider.updated)
	}
}

func TestDnsFailoverTransitionWaitsUntilErrorThreshold(t *testing.T) {
	provider := &fakeDNSProvider{}
	record := DnsRecord{ID: "record-1", RecordType: "A", Host: "@", Value: "1.1.1.1", TTL: 600, Status: 1}
	task := DnsFailoverTask{MaxErrors: 3, ErrorCount: 1, FailoverValue: "2.2.2.2", OriginalValue: "1.1.1.1", Status: 1}

	result, updated, err := dnsApplyFailoverTransition(context.Background(), provider, "example.com", task, record, false, "connection refused")
	if err != nil {
		t.Fatalf("dnsApplyFailoverTransition() error = %v", err)
	}
	if result.Action != "check_error" {
		t.Fatalf("action = %q, want check_error", result.Action)
	}
	if result.ErrorCount != 2 {
		t.Fatalf("error count = %d, want 2", result.ErrorCount)
	}
	if updated.Value != "1.1.1.1" {
		t.Fatalf("record value = %q, should not switch before threshold", updated.Value)
	}
	if len(provider.updated) != 0 {
		t.Fatalf("provider updates = %#v, want none", provider.updated)
	}
}

func TestDnsFailoverTaskDueRespectsInterval(t *testing.T) {
	now := time.Date(2026, 5, 29, 12, 0, 0, 0, time.UTC)
	recent := now.Add(-30 * time.Second)
	stale := now.Add(-2 * time.Minute)

	if dnsFailoverTaskDue(DnsFailoverTask{Status: 0}, now) {
		t.Fatalf("disabled task should not be due")
	}
	if !dnsFailoverTaskDue(DnsFailoverTask{Status: 1, LastCheckAt: nil}, now) {
		t.Fatalf("never checked task should be due")
	}
	if dnsFailoverTaskDue(DnsFailoverTask{Status: 1, CheckInterval: 60, LastCheckAt: &recent}, now) {
		t.Fatalf("recently checked task should not be due")
	}
	if !dnsFailoverTaskDue(DnsFailoverTask{Status: 1, CheckInterval: 60, LastCheckAt: &stale}, now) {
		t.Fatalf("stale task should be due")
	}
}
