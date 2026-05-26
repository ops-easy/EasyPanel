package core

import (
	"strings"
	"testing"
)

func TestProbeBaotaForSystemCheckTreatsMissingAPIKeyAsNotConfigured(t *testing.T) {
	status, msg := probeBaotaForSystemCheck(Config{BaotaURL: "http://127.0.0.1:8888"})

	if status != "not_configured" {
		t.Fatalf("status = %q, want not_configured; msg=%q", status, msg)
	}
	if strings.Contains(msg, "127.0.0.1") || strings.Contains(strings.ToLower(msg), "dial tcp") {
		t.Fatalf("msg leaked probe details: %q", msg)
	}
}
