import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const auditDisplaySource = readFileSync(new URL("../src/lib/audit-display.ts", import.meta.url), "utf8");
const platformAuditSource = readFileSync(
  new URL("../src/features/account/pages/PlatformAudit.tsx", import.meta.url),
  "utf8"
);

test("vmlog audit entries use product-facing labels instead of raw API paths", () => {
  assert.match(auditDisplaySource, /apiVmLogMutationLabel/);
  assert.match(auditDisplaySource, /\/api\/ops\/vmlog\/overview/);
  assert.match(auditDisplaySource, /查看 VictoriaLogs 日志总览/);
  assert.match(auditDisplaySource, /查看 VictoriaLogs 日志详情/);
  assert.match(auditDisplaySource, /统计 VictoriaLogs 日志/);
  assert.match(auditDisplaySource, /OpenClaw 分析日志/);
  assert.match(auditDisplaySource, /下发日志采集器/);
});

test("platform audit classifies vmlog entries under AI inspect", () => {
  assert.match(auditDisplaySource, /AI 巡检/);
  assert.match(auditDisplaySource, /p\.includes\("\/api\/ops\/vmlog\/"\)/);
  assert.match(platformAuditSource, /"aiInspect"/);
  assert.match(platformAuditSource, /AI 巡检/);
  assert.match(platformAuditSource, /p\.includes\("\/ops\/vmlog\/"\)/);
});
