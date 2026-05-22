import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const readIfExists = (path) => (existsSync(url(path)) ? read(path) : "");

const networkDashboard = read("../src/features/network/pages/NetworkDashboard.tsx");
const openWrtWorkspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
const networkSharedUi = readIfExists("../src/features/network/components/NetworkOpsPrimitives.tsx");

test("network pages keep raw JSON behind the shared disclosure component", () => {
  assert.match(networkSharedUi, /function RawDataDisclosure\b/);
  assert.doesNotMatch(networkDashboard, /JSON\.stringify/);
  assert.doesNotMatch(openWrtWorkspace, /function JsonBlock\b/);
  assert.doesNotMatch(openWrtWorkspace, /<JsonBlock\b/);
});

test("iKuai route pages are independent views instead of dashboard re-exports", () => {
  for (const [file, view] of [
    ["../src/features/network/ikuai/pages/IkuaiDashboard.tsx", "dashboard"],
    ["../src/features/network/ikuai/pages/IkuaiInterfaces.tsx", "interfaces"],
    ["../src/features/network/ikuai/pages/IkuaiClients.tsx", "clients"],
    ["../src/features/network/ikuai/pages/IkuaiVmMapping.tsx", "vm-mapping"],
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /import\s+IkuaiDashboard\s+from\s+["']\.\/IkuaiDashboard["']/);
    assert.doesNotMatch(source, /export\s+default\s+IkuaiDashboard/);
    assert.match(source, new RegExp(`view="${view}"`));
  }
});
