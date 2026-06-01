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

function assertCallsUseConfirm(text, marker) {
  const calls = collectApiCalls(text, marker, /apiPutJson\s*(?:<[^>]+>)?\(/);
  assert.ok(calls.length > 0, `expected PUT call containing ${marker}`);
  for (const call of calls) {
    assert.match(
      call,
      /withAppCenterMutationConfirmQuery\(|confirm=true/,
      `platform config write must carry confirm:\n${call}`
    );
  }
}

test("App Center platform bootstrap and catalog writes carry explicit confirmation", () => {
  const cloudVmBootstrap = read("features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx");
  const hermes = read("features/app-center/hermes/pages/AppCenterHermes.tsx");
  const openclawBootstrap = read("features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx");

  assert.match(cloudVmBootstrap, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
  assert.match(hermes, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
  assert.match(openclawBootstrap, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);

  assertCallsUseConfirm(cloudVmBootstrap, "/api/app-center/cloud-vm/bootstrap");
  assertCallsUseConfirm(hermes, "/api/app-center/hermes/bootstrap");
  assertCallsUseConfirm(openclawBootstrap, "/api/app-center/openclaw/image-catalog");
  assertCallsUseConfirm(openclawBootstrap, "/api/app-center/openclaw/bootstrap");
});
