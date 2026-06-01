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
      if (i - start > 10) break;
    }
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes(");")) {
      end += 1;
      if (end - i > 18) break;
    }
    const call = lines.slice(start, end + 1).join("\n");
    if (callPattern.test(call)) calls.push(call);
  }
  return calls;
}

function assertCallsUseBodyConfirm(text, marker, callPattern) {
  const calls = collectApiCalls(text, marker, callPattern);
  assert.ok(calls.length > 0, `expected call containing ${marker}`);
  for (const call of calls) {
    assert.match(
      call,
      /withAppCenterMutationConfirm\(|confirm:\s*true/,
      `app-center metadata write must carry confirm:\n${call}`
    );
  }
}

test("App Center metadata writes carry explicit confirmation", () => {
  const redis = read("features/app-center/redis/pages/AppCenterRedis.tsx");
  const redisTemplates = read("features/app-center/redis/pages/AppCenterRedisTemplates.tsx");
  const mysql = read("features/app-center/mysql/pages/AppCenterMySQL.tsx");
  const kafka = read("features/app-center/kafka/pages/AppCenterKafka.tsx");
  const opensearch = read("features/app-center/opensearch/pages/AppCenterOpenSearch.tsx");

  for (const source of [redis, redisTemplates, mysql, kafka, opensearch]) {
    assert.match(source, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
  }

  assertCallsUseBodyConfirm(redis, '"/api/app-center/redis/instances"', /apiPostJson\s*(?:<[^>]+>)?\(/);
  assertCallsUseBodyConfirm(redisTemplates, "/api/app-center/redis/templates/${editing.id}`", /apiPutJson\s*(?:<[^>]+>)?\(/);
  assertCallsUseBodyConfirm(redisTemplates, '"/api/app-center/redis/templates"', /apiPostJson\s*(?:<[^>]+>)?\(/);

  assertCallsUseBodyConfirm(mysql, '"/api/app-center/mysql/instances"', /apiPostJson\s*(?:<[^>]+>)?\(/);
  assertCallsUseBodyConfirm(mysql, '"/api/app-center/mysql/templates"', /apiPostJson\s*(?:<[^>]+>)?\(/);

  assertCallsUseBodyConfirm(kafka, "/api/app-center/kafka/templates/${editing.id}`", /apiPutJson\s*(?:<[^>]+>)?\(/);
  assertCallsUseBodyConfirm(kafka, '"/api/app-center/kafka/templates"', /apiPostJson\s*(?:<[^>]+>)?\(/);

  assertCallsUseBodyConfirm(opensearch, "/api/app-center/opensearch/templates/${editing.id}`", /apiPutJson\s*(?:<[^>]+>)?\(/);
  assertCallsUseBodyConfirm(opensearch, '"/api/app-center/opensearch/templates"', /apiPostJson\s*(?:<[^>]+>)?\(/);
});
