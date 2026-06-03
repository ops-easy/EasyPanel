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

test("monitoring datasource filter bar fills the header panel on wide screens", () => {
  const source = read("src/features/ops/ai-inspect/pages/AiInspectMonitoring.tsx");

  assert.match(
    source,
    /className="grid gap-4 lg:grid-cols-\[minmax\(16rem,1fr\)_minmax\(10rem,0\.65fr\)_minmax\(9rem,0\.55fr\)_minmax\(18rem,1fr\)\] lg:items-start"/,
  );
  assert.match(source, /lg:border-l lg:border-slate-100 lg:pl-5/);
  assert.ok((source.match(/<SelectTrigger className="w-full">/g) ?? []).length >= 3);
  assert.doesNotMatch(source, /lg:flex-row lg:flex-wrap/);
});
