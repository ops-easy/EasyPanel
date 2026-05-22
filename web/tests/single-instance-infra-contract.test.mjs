import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("PVE 前端只展示一个有效目标", () => {
  const workspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");
  const subnav = read("../src/features/compute/layout/ComputeSubNav.tsx");

  assert.match(workspace, /singlePveTarget/);
  assert.match(workspace, /PveInstancePanel/);
  assert.match(workspace, /配置 PVE/);
  assert.doesNotMatch(workspace, /function TargetList\b/);
  assert.doesNotMatch(workspace, /onSelect=\{setActiveId\}/);
  assert.doesNotMatch(subnav, /onSelect=\{setActiveId\}/);
});

test("OpenWrt 前端只展示一个有效实例", () => {
  const workspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
  const dashboard = read("../src/features/network/pages/NetworkDashboard.tsx");
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  assert.match(workspace, /singleNetworkDeviceByKind/);
  assert.match(workspace, /OpenWrtInstancePanel/);
  assert.doesNotMatch(workspace, /openWrtDevices\.map/);
  assert.doesNotMatch(workspace, /onActiveChange=\{setActiveId\}/);
  assert.match(config, /OpenWrtInstancePanel/);
  assert.match(dashboard, /ProviderAccessBadge/);
});

test("iKuai 前端使用保存的单实例", () => {
  const gate = read("../src/features/network/ikuai/pages/IkuaiConfigurationGate.tsx");
  const router = read("../src/features/vcenter/pages/VCenterIkuaiRouterPage.tsx");
  const dashboard = read("../src/features/network/pages/NetworkDashboard.tsx");
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  assert.match(gate, /singleNetworkDeviceByKind/);
  assert.match(gate, /upsertIkuaiDevice/);
  assert.match(router, /savedIkuaiDevice/);
  assert.match(router, /instanceLabel/);
  assert.match(config, /IkuaiConfigPanel/);
  assert.match(dashboard, /ProviderAccessBadge/);
  assert.doesNotMatch(gate, /ikuaiDevices\.length > 0/);
});

test("vCenter 保持全局单实例配置", () => {
  const config = read("../../api/common/core/config.go");
  const session = read("../../api/common/core/vcenter_session.go");

  assert.match(config, /VCenterURL\s+string/);
  assert.match(config, /VCenterUser\s+string/);
  assert.match(config, /VCenterPassword\s+string/);
  assert.match(session, /func \(c Config\) vCenterConfigured\(\) bool/);
});
