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
  assert.ok(calls.length > 0, `Cloud VM detail should call ${marker}`);
  for (const call of calls) {
    assert.match(call, expected, `Cloud VM call to ${marker} must carry explicit confirm:\n${call}`);
  }
}

test("Cloud VM dangerous API calls carry explicit confirmation", () => {
  const detail = read("features/app-center/cloudvm/pages/AppCenterCloudVmDetail.tsx");
  const list = read("features/app-center/cloudvm/pages/AppCenterCloudVm.tsx");

  assert.match(
    detail,
    /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/,
    "Cloud VM detail should use app-center confirmation helpers"
  );
  assert.match(
    list,
    /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/,
    "Cloud VM create page should use app-center confirmation helpers"
  );

  const bodyConfirm = /withAppCenterMutationConfirm\(|confirm:\s*true/;
  const queryConfirm = /withAppCenterMutationConfirmQuery\(|confirm=true/;

  assertCallsUseConfirm(
    list,
    "/api/app-center/cloud-vm/instances",
    /apiPostJson\s*(?:<[^>]+>)?\(/,
    queryConfirm
  );
  assertCallsUseConfirm(
    detail,
    "/api/app-center/cloud-vm/instances/${id}`",
    /apiPutJson\s*(?:<[^>]+>)?\(/,
    bodyConfirm
  );
  assertCallsUseConfirm(
    detail,
    "/api/app-center/cloud-vm/instances/${id}/scale",
    /apiPostJson\s*(?:<[^>]+>)?\(/,
    bodyConfirm
  );
  assertCallsUseConfirm(
    detail,
    "/api/app-center/cloud-vm/instances/${id}/reset-root-password",
    /apiPostJson\s*(?:<[^>]+>)?\(/,
    bodyConfirm
  );
  assertCallsUseConfirm(
    detail,
    "/api/app-center/cloud-vm/instances/${id}/reveal-hysteria-client",
    /apiPostJson\s*(?:<[^>]+>)?\(/,
    bodyConfirm
  );
  assertCallsUseConfirm(
    detail,
    "/api/app-center/cloud-vm/instances/${id}`",
    /apiDelete\s*\(/,
    queryConfirm
  );
});

test("Cloud VM inline configuration actions use in-app confirmation", () => {
  const detail = read("features/app-center/cloudvm/pages/AppCenterCloudVmDetail.tsx");
  const list = read("features/app-center/cloudvm/pages/AppCenterCloudVm.tsx");

  assert.match(
    list,
    /const submitCreate = \(\) => \{[\s\S]*createMut\.mutate\(\);[\s\S]*\};/,
    "Creating a Cloud VM should submit through an explicit handler"
  );
  assert.match(
    list,
    /<ConfirmActionButton[\s\S]*title=[\s\S]*onConfirm=\{submitCreate\}/,
    "Creating a Cloud VM should use the platform confirmation dialog before submitting the K8s workload"
  );
  assert.doesNotMatch(list, /confirmAppCenterMutation|window\.confirm|\bconfirm\s*\(/);

  assert.match(
    detail,
    /const confirmAndSaveInit = \(\) => \{[\s\S]*saveInitMut\.mutate\(\);[\s\S]*\};/,
    "Saving Cloud VM init/software settings should submit through an explicit handler"
  );
  assert.match(
    detail,
    /<ConfirmActionButton[\s\S]*title=[\s\S]*onConfirm=\{confirmAndSaveInit\}/,
    "Saving Cloud VM init/software settings should use the platform confirmation dialog before mutation"
  );
  assert.match(
    detail,
    /const confirmAndSyncRootPassword = \(\) => \{[\s\S]*saveRootPasswordOnlyMut\.mutate\(\);[\s\S]*\};/,
    "Syncing Cloud VM root password should submit through an explicit handler"
  );
  assert.match(
    detail,
    /<ConfirmActionButton[\s\S]*title=[\s\S]*onConfirm=\{confirmAndSyncRootPassword\}/,
    "Syncing Cloud VM root password should use the platform confirmation dialog before mutation"
  );
  assert.doesNotMatch(detail, /confirmAppCenterMutation|window\.confirm|\bconfirm\s*\(/);
});
