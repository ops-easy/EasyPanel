import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

test("compute resource page delegates filters table status and actions", () => {
  const page = read("../src/features/compute/pages/ComputeResourcePage.tsx");

  for (const component of [
    "ComputeResourceFilters",
    "ComputeResourceTable",
    "ComputeStatusBadge",
  ]) {
    assert.match(page, new RegExp(component));
  }

  assert.match(page, /filteredRows/);
  assert.match(page, /health/);
  assert.match(page, /provider/);
});

test("compute resource table defines resource-specific columns and action metadata", () => {
  assert.equal(exists("../src/features/compute/components/ComputeResourceTable.tsx"), true);
  assert.equal(exists("../src/features/compute/components/ComputeResourceFilters.tsx"), true);
  assert.equal(exists("../src/features/compute/components/ComputeStatusBadge.tsx"), true);
  assert.equal(exists("../src/features/compute/components/ComputeRowActions.tsx"), true);

  const table = read("../src/features/compute/components/ComputeResourceTable.tsx");
  for (const marker of [
    "guestColumns",
    "hostColumns",
    "storageColumns",
    "activityColumns",
    "ComputeRowActions",
  ]) {
    assert.match(table, new RegExp(marker));
  }
  assert.match(table, /actions/);
  assert.match(table, /statusLabel/);
  assert.match(table, /capabilityLabel/);
  assert.match(table, /power: "电源"/);
  assert.match(table, /hardware: "硬件"/);
  assert.match(table, /function formatCpuCores/);
  assert.match(table, /sourceValue\(row, "maxcpu", "cores", "cpus", "vcpus"\)/);
  assert.doesNotMatch(table, /sourceValue\(row, "cpu", "maxcpu"\)/);
});

test("compute filters expose semantic pressed states for custom controls", () => {
  const filters = read("../src/features/compute/components/ComputeResourceFilters.tsx");

  assert.match(filters, /aria-pressed/);
  assert.match(filters, /全部来源/);
  assert.match(filters, /健康状态/);
  assert.match(filters, /搜索名称、ID、节点、IP/);
});

test("compute row actions deep link to console and ssh detail tabs", () => {
  const actions = read("../src/features/compute/components/ComputeRowActions.tsx");
  const vcenterDetail = read("../src/features/vcenter/pages/VCenterVMDetail.tsx");
  const pveDetail = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");

  assert.match(actions, /tab=console/);
  assert.match(actions, /tab=ssh/);
  assert.match(vcenterDetail, /useSearchParams/);
  assert.match(vcenterDetail, /defaultValue=\{initialTab\}/);
  assert.match(pveDetail, /useSearchParams/);
  assert.match(pveDetail, /defaultValue=\{initialTab\}/);
});

test("compute row PVE power actions stay in detail pages instead of the unified table", () => {
  const page = read("../src/features/compute/pages/ComputeResourcePage.tsx");
  const table = read("../src/features/compute/components/ComputeResourceTable.tsx");
  const actions = read("../src/features/compute/components/ComputeRowActions.tsx");
  const pveDetail = read("../src/features/compute/pve/pages/PveGuestDetail.tsx");

  assert.doesNotMatch(page, /pvePowerMut/);
  assert.doesNotMatch(page, /\/api\/pve\/targets\/\$\{encodeURIComponent\(targetId\)\}\/guests\/\$\{encodeURIComponent\(vmid\)\}\/power/);
  assert.doesNotMatch(table, /onPvePower/);
  assert.doesNotMatch(actions, /ConfirmActionButton/);
  assert.doesNotMatch(actions, /PVE_POWER_ACTIONS/);
  assert.match(actions, /详情/);
  assert.match(pveDetail, /PVE_POWER_ACTIONS/);
  assert.match(pveDetail, /powerMut\.mutate\(item\.action\)/);
});
