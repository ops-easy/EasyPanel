import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("monitoring datasource selector describes VMware source and gates unconfigured vCenter", () => {
  const source = read("src/features/ops/ai-inspect/pages/AiInspectMonitoring.tsx");

  assert.doesNotMatch(source, /vCenter Prometheus \/ VM/);
  assert.match(source, /vCenter \/ VMware 指标源/);
  assert.match(source, /Telegraf vSphere|vmware_\/vsphere_/);
  assert.match(source, /disabled=\{option.disabled\}/);
  assert.match(source, /prometheusUrlVcenter \/ vmSelectUrlVcenter/);
});
