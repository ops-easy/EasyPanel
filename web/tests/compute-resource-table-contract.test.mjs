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
