package controller

import (
	"context"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestDnsFailoverHealthCheckBlocksLoopbackTargets(t *testing.T) {
	restore := stubDnsFailoverLookupIP(t, map[string][]net.IP{
		"localhost": {net.ParseIP("127.0.0.1")},
	})
	defer restore()

	port, err := strconv.Atoi("8080")
	if err != nil {
		t.Fatal(err)
	}
	ok, msg := dnsDoHealthCheck(context.Background(), &DnsFailoverTask{
		CheckType:    "tcp",
		CheckTarget:  "127.0.0.1",
		CheckPort:    port,
		CheckTimeout: 1,
	})
	if ok {
		t.Fatalf("dnsDoHealthCheck(tcp loopback) ok = true, msg = %q", msg)
	}
	if !strings.Contains(msg, "内网") {
		t.Fatalf("dnsDoHealthCheck(tcp loopback) msg = %q, want private target detail", msg)
	}

	ok, msg = dnsDoHealthCheck(context.Background(), &DnsFailoverTask{
		CheckType:    "ping",
		CheckTarget:  "http://localhost/healthz",
		CheckTimeout: 1,
	})
	if ok {
		t.Fatalf("dnsDoHealthCheck(ping localhost) ok = true, msg = %q", msg)
	}
	if !strings.Contains(msg, "内网") {
		t.Fatalf("dnsDoHealthCheck(ping localhost) msg = %q, want private target detail", msg)
	}
}

func TestDnsFailoverTargetValidationRejectsPrivateAndLinkLocalAddresses(t *testing.T) {
	restore := stubDnsFailoverLookupIP(t, map[string][]net.IP{
		"internal.example.com": {net.ParseIP("10.0.0.7")},
		"public.example.com":   {net.ParseIP("8.8.8.8")},
	})
	defer restore()

	for _, host := range []string{
		"10.0.0.1",
		"172.16.0.1",
		"192.168.1.1",
		"100.64.0.1",
		"169.254.169.254",
		"198.18.0.1",
		"::1",
		"fc00::1",
		"internal.example.com",
	} {
		if err := dnsFailoverValidatePublicHost(context.Background(), host); err == nil {
			t.Fatalf("dnsFailoverValidatePublicHost(%q) error = nil, want blocked", host)
		}
	}

	if err := dnsFailoverValidatePublicHost(context.Background(), "public.example.com"); err != nil {
		t.Fatalf("dnsFailoverValidatePublicHost(public.example.com) error = %v", err)
	}
}

func TestDnsFailoverResolvePublicHostReturnsDialIP(t *testing.T) {
	restore := stubDnsFailoverLookupIP(t, map[string][]net.IP{
		"public.example.com": {net.ParseIP("8.8.8.8")},
	})
	defer restore()

	target, err := dnsFailoverResolvePublicHost(context.Background(), "public.example.com:443")
	if err != nil {
		t.Fatalf("dnsFailoverResolvePublicHost(public.example.com:443) error = %v", err)
	}
	if target.Host != "public.example.com" {
		t.Fatalf("target.Host = %q, want public.example.com", target.Host)
	}
	if got := target.IP.String(); got != "8.8.8.8" {
		t.Fatalf("target.IP = %q, want 8.8.8.8", got)
	}
}

func stubDnsFailoverLookupIP(t *testing.T, records map[string][]net.IP) func() {
	t.Helper()
	old := dnsFailoverLookupIP
	dnsFailoverLookupIP = func(_ context.Context, _ string, host string) ([]net.IP, error) {
		if ips, ok := records[host]; ok {
			return ips, nil
		}
		return []net.IP{net.ParseIP("8.8.4.4")}, nil
	}
	return func() { dnsFailoverLookupIP = old }
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
