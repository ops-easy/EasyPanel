import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const platformAuditSource = read("../src/features/account/pages/PlatformAudit.tsx");

test("platform audit rows use a compact scannable column layout", () => {
  assert.match(platformAuditSource, /const auditRowGridClass =/);
  assert.match(
    platformAuditSource,
    /md:grid-cols-\[minmax\(8rem,1fr\)_minmax\(0,1\.2fr\)_minmax\(13rem,1\.4fr\)_auto\]/
  );
  assert.match(platformAuditSource, /hover:bg-slate-50/);
  assert.match(platformAuditSource, /事件/);
  assert.match(platformAuditSource, /对象/);
  assert.match(platformAuditSource, /时间与来源/);
  assert.match(platformAuditSource, /模块/);
  assert.match(platformAuditSource, /truncate/);
  assert.doesNotMatch(platformAuditSource, /flex flex-wrap items-start justify-between gap-2/);
});
