import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const computeSubNav = read("../src/features/compute/layout/ComputeSubNav.tsx");
const networkSubNav = read("../src/features/network/layout/NetworkSubNav.tsx");
const networkRoutes = read("../src/app/routes/network-routes.tsx");

const pvePageNames = [
  "PveDashboard",
  "PveTargets",
  "PveNodes",
  "PveGuests",
  "PveStorage",
  "PveTasks",
];

const openWrtPageNames = [
  "OpenWrtDashboard",
  "OpenWrtInterfaces",
  "OpenWrtClients",
  "OpenWrtConnections",
  "OpenWrtWireless",
  "OpenWrtExporter",
];

test("PVE 子路由页面不再复用同一个 PVEPage 占位页", () => {
  for (const page of pvePageNames) {
    const source = read(`../src/features/compute/pve/pages/${page}.tsx`);
    assert.doesNotMatch(source, /import\s+PVEPage\s+from\s+["']\.\.\/\.\.\/pages\/PVEPage["']/);
    assert.doesNotMatch(source, /export\s+default\s+PVEPage/);
    assert.match(source, new RegExp(`function\\s+${page}\\b|const\\s+${page}\\b`));
  }
});

test("OpenWrt 子路由页面不再互相 re-export 仪表盘占位页", () => {
  for (const page of openWrtPageNames) {
    const source = read(`../src/features/network/openwrt/pages/${page}.tsx`);
    assert.doesNotMatch(source, /import\s+NetworkDashboard\s+from\s+["']\.\.\/\.\.\/pages\/NetworkDashboard["']/);
    if (page !== "OpenWrtDashboard") {
      assert.doesNotMatch(source, /import\s+OpenWrtDashboard\s+from\s+["']\.\/OpenWrtDashboard["']/);
      assert.doesNotMatch(source, /export\s+default\s+OpenWrtDashboard/);
    }
    assert.match(source, new RegExp(`function\\s+${page}\\b|const\\s+${page}\\b`));
  }
});

test("PVE 与 OpenWrt 子导航覆盖所有新子页面", () => {
  for (const path of [
    "/cluster/compute/pve/dashboard",
    "/cluster/compute/pve/targets",
    "/cluster/compute/pve/nodes",
    "/cluster/compute/pve/guests",
    "/cluster/compute/pve/storage",
    "/cluster/compute/pve/tasks",
  ]) {
    assert.match(computeSubNav, new RegExp(`to:\\s*["']${path}`));
  }

  for (const path of [
    "/cluster/network/openwrt/dashboard",
    "/cluster/network/openwrt/interfaces",
    "/cluster/network/openwrt/clients",
    "/cluster/network/openwrt/connections",
    "/cluster/network/openwrt/wireless",
    "/cluster/network/openwrt/exporter",
  ]) {
    assert.match(networkSubNav, new RegExp(`to:\\s*["']${path}`));
  }

  assert.match(networkRoutes, /const OpenWrtExporter = lazy/);
  assert.match(networkRoutes, /path="openwrt\/exporter"[\s\S]*<OpenWrtExporter \/>/);
});

test("route-specific 页面复用现有 PVE/OpenWrt 数据接口", () => {
  const pveWorkspacePath = new URL("../src/features/compute/pve/pages/PveWorkspace.tsx", import.meta.url);
  const openWrtWorkspacePath = new URL("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx", import.meta.url);
  assert.equal(existsSync(pveWorkspacePath), true);
  assert.equal(existsSync(openWrtWorkspacePath), true);

  const pveWorkspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");
  for (const endpoint of ["/summary", "/nodes", "/guests", "/storage", "/tasks"]) {
    assert.match(pveWorkspace, new RegExp(endpoint.replace("/", "\\/")));
  }

  const openWrtWorkspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
  for (const endpoint of ["/overview", "/interfaces", "/clients", "/traffic", "/exporter-status"]) {
    assert.match(openWrtWorkspace, new RegExp(endpoint.replace("/", "\\/")));
  }
});
