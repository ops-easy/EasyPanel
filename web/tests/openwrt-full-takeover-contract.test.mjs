import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("OpenWrt pages expose real management panels", () => {
  const workspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
  const dashboard = read("../src/features/network/openwrt/pages/OpenWrtDashboard.tsx");
  const interfacesPage = read("../src/features/network/openwrt/pages/OpenWrtInterfaces.tsx");
  const clientsPage = read("../src/features/network/openwrt/pages/OpenWrtClients.tsx");
  const wirelessPage = read("../src/features/network/openwrt/pages/OpenWrtWireless.tsx");

  assert.match(workspace, /OpenWrtTargetPanel/);
  assert.match(workspace, /OpenWrtActionPanel/);
  assert.match(workspace, /openwrt\/probe/);
  assert.match(workspace, /openwrt\/overview/);
  assert.match(workspace, /openwrt\/interfaces/);
  assert.match(workspace, /openwrt\/clients/);
  assert.match(workspace, /openwrt\/wireless/);
  assert.match(workspace, /openwrt\/firewall/);

  assert.match(dashboard, /view="dashboard"/);
  assert.match(interfacesPage, /view="interfaces"/);
  assert.match(clientsPage, /view="clients"/);
  assert.match(wirelessPage, /view="wireless"/);
});

test("OpenWrt UI does not present permanent empty-shell tables", () => {
  const workspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
  assert.doesNotMatch(workspace, /clients:\s*\[\]/);
  assert.doesNotMatch(workspace, /mappings:\s*\[\]/);
  assert.doesNotMatch(workspace, /请先新增 PVE 目标/);
});
