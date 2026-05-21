package core

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPruneAuditLogToRetentionReplacesFileAfterClosingReadHandle(t *testing.T) {
	dir := t.TempDir()
	oldRec := AuditRecord{
		Ts:     time.Now().UTC().AddDate(0, 0, -auditRetentionDays-1).Format(time.RFC3339Nano),
		Action: "api",
		Path:   "/api/old",
	}
	newRec := AuditRecord{
		Ts:     time.Now().UTC().Format(time.RFC3339Nano),
		Action: "api",
		Path:   "/api/new",
	}
	var b strings.Builder
	for _, rec := range []AuditRecord{oldRec, newRec} {
		raw, err := json.Marshal(rec)
		if err != nil {
			t.Fatal(err)
		}
		b.Write(raw)
		b.WriteByte('\n')
	}
	path := filepath.Join(dir, auditFileName)
	if err := os.WriteFile(path, []byte(b.String()), 0600); err != nil {
		t.Fatal(err)
	}

	if err := PruneAuditLogToRetention(dir); err != nil {
		t.Fatalf("PruneAuditLogToRetention: %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	got := string(raw)
	if strings.Contains(got, "/api/old") {
		t.Fatalf("old record was not pruned: %s", got)
	}
	if !strings.Contains(got, "/api/new") {
		t.Fatalf("new record missing after prune: %s", got)
	}
}
