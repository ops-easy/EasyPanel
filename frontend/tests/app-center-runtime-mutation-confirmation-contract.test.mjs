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

function assertCallsUseConfirm(text, marker, callPattern) {
  const calls = collectApiCalls(text, marker, callPattern);
  assert.ok(calls.length > 0, `expected call containing ${marker}`);
  for (const call of calls) {
    assert.match(
      call,
      /withAppCenterMutationConfirmQuery\(|confirm=true/,
      `dangerous app-center call must carry confirm:\n${call}`
    );
  }
}

test("App Center template deletes carry explicit confirmation", () => {
  const redisTemplates = read("features/app-center/redis/pages/AppCenterRedisTemplates.tsx");
  const opensearch = read("features/app-center/opensearch/pages/AppCenterOpenSearch.tsx");

  assert.match(redisTemplates, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
  assert.match(opensearch, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  assertCallsUseConfirm(redisTemplates, "/api/app-center/redis/templates/${id}`", /apiDeleteJson/);
  assertCallsUseConfirm(opensearch, "/api/app-center/opensearch/templates/${id}`", /apiDeleteJson/);
});

test("App Center Hermes runtime mutations carry explicit confirmation", () => {
  const app = read("features/app-center/hermes/pages/AppCenterHermes.tsx");
  const detail = read("features/app-center/hermes/pages/AppCenterHermesDetail.tsx");
  const exposure = read("features/app-center/hermes/pages/HermesExposurePanel.tsx");
  const upgrade = read("features/app-center/hermes/pages/HermesUpgradeDialog.tsx");

  for (const source of [app, detail, exposure, upgrade]) {
    assert.match(source, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
  }

  assertCallsUseConfirm(app, "/restart`", /apiPostJson/);
  assertCallsUseConfirm(app, "/file`", /apiPutJson/);
  assertCallsUseConfirm(app, "/instances/${encodeURIComponent(id)}`", /apiDelete/);

  assertCallsUseConfirm(detail, "/restart`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/file`", /apiPutJson/);
  assertCallsUseConfirm(detail, "/migrate-openclaw`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/instances/${encodeURIComponent(id)}`", /apiDelete/);

  assertCallsUseConfirm(exposure, "/exposure`", /apiPutJson/);
  assertCallsUseConfirm(upgrade, "/upgrade`", /apiPostJson/);
  assertCallsUseConfirm(upgrade, "/rollback`", /apiPostJson/);
});

test("App Center OpenClaw runtime mutations carry explicit confirmation", () => {
  const detail = read("features/app-center/openclaw/pages/AppCenterOpenClawDetail.tsx");

  assert.match(detail, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  assertCallsUseConfirm(detail, "/file`", /apiPutJson/);
  assertCallsUseConfirm(detail, "/rbac-preset`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/apply-toolchain-preset`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/apply-upstream-runtime`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/egress-proxy`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/telegram-settings`", /apiPutJson/);
  assertCallsUseConfirm(detail, "/gateway-image`", /apiPostJson/);
  assertCallsUseConfirm(detail, "/apply-telegram-to-openclaw-json`", /apiPostJson/);
});
