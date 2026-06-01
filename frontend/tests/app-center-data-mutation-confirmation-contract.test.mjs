import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "../src");

function read(rel) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function collectApiCalls(text, marker, callPattern) {
  const lines = text.split(/\r?\n/);
  const calls = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(marker)) continue;
    let start = i;
    while (start > 0 && !callPattern.test(lines[start])) {
      start -= 1;
      if (i - start > 8) break;
    }
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes(");")) {
      end += 1;
      if (end - i > 12) break;
    }
    const call = lines.slice(start, end + 1).join("\n");
    if (callPattern.test(call)) {
      calls.push(call);
    }
  }
  return calls;
}

function assertCallsUseConfirm(text, marker, callPattern, expected) {
  const calls = collectApiCalls(text, marker, callPattern);
  assert.ok(calls.length > 0, `expected call containing ${marker}`);
  for (const call of calls) {
    assert.match(call, expected, `dangerous app-center call must carry confirm:\n${call}`);
  }
}

test("App Center MySQL destructive calls carry explicit confirmation", () => {
  const mysql = read("features/app-center/mysql/pages/AppCenterMySQL.tsx");

  assert.match(mysql, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  const bodyConfirm = /withAppCenterMutationConfirm\(|confirm:\s*true/;
  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(mysql, "/api/app-center/mysql/instances/${id}`", /apiDeleteJson\s*(?:<[^>]+>)?\(/, queryConfirm);
  assertCallsUseConfirm(mysql, "/restore", /apiPostJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assertCallsUseConfirm(mysql, "/backups/${id}`", /apiDeleteJson\s*(?:<[^>]+>)?\(/, queryConfirm);
  assertCallsUseConfirm(mysql, "/backups`", /apiPostJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assertCallsUseConfirm(mysql, "/users`", /apiPostJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assertCallsUseConfirm(mysql, "/password", /apiPutJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assertCallsUseConfirm(mysql, "/users/${encodeURIComponent(u.username)}?host=", /apiDeleteJson\s*(?:<[^>]+>)?\(/, queryConfirm);
  assertCallsUseConfirm(mysql, "/query", /apiPostJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assert.match(mysql, /confirmMutation[\s\S]*ConfirmActionButton[\s\S]*确认执行写 SQL/, "mutation SQL submit should ask for platform confirmation");
  assert.doesNotMatch(mysql, /confirmAppCenterMutation|window\.confirm|\bconfirm\s*\(/);
});

test("App Center Redis destructive calls carry explicit confirmation", () => {
  const redis = read("features/app-center/redis/pages/AppCenterRedis.tsx");

  assert.match(redis, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  const bodyConfirm = /withAppCenterMutationConfirm\(|confirm:\s*true/;
  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(redis, "/keys/delete", /apiPostJson\s*(?:<[^>]+>)?\(/, bodyConfirm);
  assertCallsUseConfirm(redis, "/api/app-center/redis/instances/${instance.id}`", /apiDeleteJson\s*(?:<[^>]+>)?\(/, queryConfirm);
});
