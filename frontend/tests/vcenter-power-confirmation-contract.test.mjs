import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("vCenter power operations require typed VM confirmation and send confirm flag", () => {
  const detail = read("../src/features/vcenter/pages/VCenterVMDetail.tsx");

  assert.match(detail, /const \[powerConfirmName, setPowerConfirmName\] = React\.useState\(""\);/);
  assert.match(detail, /const powerConfirmTarget = vmDisplayName\.trim\(\) \|\| decoded;/);
  assert.match(detail, /const powerConfirmed = powerConfirmName\.trim\(\) === powerConfirmTarget;/);
  assert.match(detail, /apiPostJson<VCenterPowerPostResponse>[\s\S]*\{ action, confirm \}/);
  assert.match(detail, /powerStartMut\.mutate\(\{ action: "on", confirm: powerConfirmed \}\)/);
  assert.match(detail, /powerStartMut\.mutate\(\{ action: "off", confirm: powerConfirmed \}\)/);
  assert.match(detail, /morePowerMut\.mutate\(\{ action: "suspend", confirm: powerConfirmed \}\)/);
  assert.match(detail, /morePowerMut\.mutate\(\{ action: "reset", confirm: powerConfirmed \}\)/);
  assert.match(detail, /morePowerMut\.mutate\(\{ action: "shutdown_guest", confirm: powerConfirmed \}\)/);
  assert.match(detail, /morePowerMut\.mutate\(\{ action: "reboot_guest", confirm: powerConfirmed \}\)/);
  assert.doesNotMatch(detail, /apiPostJson<VCenterPowerPostResponse>[\s\S]*\{ action \}/);
});

test("vCenter hardware and disk mutations require typed VM confirmation and send confirm flag", () => {
  const detail = read("../src/features/vcenter/pages/VCenterVMDetail.tsx");

  assert.match(detail, /const \[resourceConfirmName, setResourceConfirmName\] = React\.useState\(""\);/);
  assert.match(detail, /const resourceConfirmed = resourceConfirmName\.trim\(\) === powerConfirmTarget;/);
  assert.match(detail, /mutationFn: \(body: \{ numCpu\?: number; memoryMB\?: number; confirm: boolean \}\)/);
  assert.match(detail, /mutationFn: \(body: \{ deviceKey: number; totalGiB: number; confirm: boolean \}\)/);
  assert.match(detail, /body\.confirm = resourceConfirmed;/);
  assert.match(detail, /disabled=\{editPending \|\| !resourceConfirmed\}/);
  assert.match(detail, /diskExpandMut\.mutate\(\{[\s\S]*deviceKey: d\.key,[\s\S]*totalGiB: g,[\s\S]*confirm: resourceConfirmed,[\s\S]*\}\);/);
});
