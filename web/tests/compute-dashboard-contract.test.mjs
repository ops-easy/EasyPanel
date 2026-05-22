import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

test("compute dashboard is an operations overview instead of only entry cards", () => {
  const dashboard = read("../src/features/compute/pages/ComputeDashboard.tsx");

  assert.match(dashboard, /ComputePageHeader/);
  assert.match(dashboard, /ComputeProviderHealthStrip/);
  assert.match(dashboard, /\/api\/compute\/summary/);
  assert.match(dashboard, /异常资源/);
  assert.match(dashboard, /容量热点/);
  assert.match(dashboard, /最近活动/);
  assert.match(dashboard, /先接入 vCenter 或 PVE/);
  assert.match(dashboard, /to="\/cluster\/compute\/config"/);
});

test("compute dashboard shared components exist", () => {
  assert.equal(exists("../src/features/compute/components/ComputePageHeader.tsx"), true);
  assert.equal(exists("../src/features/compute/components/ComputeProviderHealthStrip.tsx"), true);

  const healthStrip = read("../src/features/compute/components/ComputeProviderHealthStrip.tsx");
  assert.match(healthStrip, /vCenter/);
  assert.match(healthStrip, /PVE/);
  assert.match(healthStrip, /已接入/);
  assert.match(healthStrip, /未接入/);
});
