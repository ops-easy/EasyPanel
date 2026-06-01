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
      if (end - i > 14) break;
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

test("App Center Kafka dangerous calls carry explicit confirmation", () => {
  const kafka = read("features/app-center/kafka/pages/AppCenterKafka.tsx");

  assert.match(kafka, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(kafka, "/templates/${id}`", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/exposure", /apiPutJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/perf-test/${encodeURIComponent(name)}`", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/perf-test`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/topics`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/topics/${encodeURIComponent(t)}`", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/acls`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/acls/delete", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/scram-users`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/scram-users/${encodeURIComponent(username)}`", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/instances/${id}`", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/configs`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/messages`", /apiPostJson/, queryConfirm);
  assertCallsUseConfirm(kafka, "/quotas`", /apiPutJson/, queryConfirm);
});

test("App Center Kafka throttle workspace dangerous calls carry explicit confirmation", () => {
  const throttle = read("features/app-center/kafka/pages/AppCenterKafkaThrottle.tsx");

  assert.match(throttle, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(throttle, "/throttle`", /apiPutJson/, queryConfirm);
  assertCallsUseConfirm(throttle, "/quotas`", /apiPutJson/, queryConfirm);
});

test("App Center OpenSearch dangerous calls carry explicit confirmation", () => {
  const opensearch = read("features/app-center/opensearch/pages/AppCenterOpenSearch.tsx");

  assert.match(opensearch, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  const bodyConfirm = /withAppCenterMutationConfirm\(|confirm:\s*true/;
  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(opensearch, "/index/settings?index=", /apiPutJson/, queryConfirm);
  assertCallsUseConfirm(opensearch, "/index?index=", /apiDeleteJson/, queryConfirm);
  assertCallsUseConfirm(opensearch, "/indices/prune", /apiPostJson/, bodyConfirm);
});
