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
    "ComputeRowActions",
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

test("compute row PVE power actions use inline confirmation instead of a disabled or typed-name entry", () => {
  const page = read("../src/features/compute/pages/ComputeResourcePage.tsx");
  const table = read("../src/features/compute/components/ComputeResourceTable.tsx");
  const actions = read("../src/features/compute/components/ComputeRowActions.tsx");

  assert.match(page, /pvePowerMut/);
  assert.match(page, /withPveMutationConfirm\(\{ node, type, action \}\)/);
  assert.match(page, /\/api\/pve\/targets\/\$\{encodeURIComponent\(targetId\)\}\/guests\/\$\{encodeURIComponent\(vmid\)\}\/power/);
  assert.match(table, /onPvePower/);
  assert.match(actions, /ConfirmActionButton/);
  assert.match(actions, /PVE_POWER_ACTIONS/);
  assert.match(actions, /onPvePower\(\{ targetId, vmid, node, type, action \}\)/);
  assert.doesNotMatch(actions, /disabled title="电源操作在详情页确认后执行"/);
  assert.doesNotMatch(actions, /#power/);
  assert.doesNotMatch(actions, /powerConfirmName/);
});
