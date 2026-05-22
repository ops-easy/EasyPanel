import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

test("虚拟机类模块使用统一算力侧配置组件", () => {
  assert.equal(exists("../src/features/compute/components/ComputeSetupPanel.tsx"), true);

  const pveWorkspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");
  const vcenterGuards = read("../src/features/vcenter/pages/VCenterConfigGuards.tsx");

  assert.match(pveWorkspace, /ComputeSetupPanel/);
  assert.match(vcenterGuards, /ComputeSetupPanel/);
  assert.match(vcenterGuards, /VCenterConnectWizard/);
});

test("网络设备类模块使用统一网络设备配置组件", () => {
  assert.equal(exists("../src/features/network/components/NetworkDeviceSetupPanel.tsx"), true);

  const openWrtWorkspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");
  const ikuaiGate = read("../src/features/network/ikuai/pages/IkuaiConfigurationGate.tsx");

  assert.match(openWrtWorkspace, /NetworkDeviceSetupPanel/);
  assert.match(ikuaiGate, /NetworkDeviceSetupPanel/);
  assert.match(ikuaiGate, /\/api\/network\/devices/);
  assert.match(ikuaiGate, /kind === "ikuai"/);
});

test("vCenter 业务路由统一经过连接或监控 gate", () => {
  const routes = read("../src/app/routes/compute-routes.tsx");

  assert.match(routes, /VCenterConnectionGate/);
  assert.match(routes, /VCenterPrometheusGate/);

  for (const page of [
    "VCenterVMDetail",
    "VCenterHostDetail",
  ]) {
    assert.match(
      routes,
      new RegExp(`<VCenterConnectionGate[\\s\\S]*<${page} \\/>[\\s\\S]*<\\/VCenterConnectionGate>`)
    );
  }

  assert.match(
    routes,
    /<VCenterPrometheusGate[\s\S]*<VCenterGpuDashboard \/>[\s\S]*<\/VCenterPrometheusGate>/
  );
});

test("GPU 监控支持 PVE 与 vCenter 数据源聚合", () => {
  const guards = read("../src/features/vcenter/pages/VCenterConfigGuards.tsx");
  const helpers = read("../src/features/vcenter/pages/vcenterPrometheusHelpers.ts");
  const gpu = read("../src/features/vcenter/pages/VCenterGpuDashboard.tsx");

  assert.doesNotMatch(guards, /请先配置 vCenter 监控数据源/);
  assert.match(guards, /虚拟化监控数据源/);
  assert.match(guards, /打开配置/);
  assert.match(guards, /\/cluster\/compute\/config/);
  assert.match(guards, /PVE/);
  assert.match(helpers, /promQueryRangeGpuScopes/);
  assert.match(helpers, /ConcreteGpuPrometheusScope/);
  assert.match(helpers, /"pve"/);
  assert.match(helpers, /"all" \| "vcenter" \| "pve"/);
  assert.match(helpers, /successCount === 0/);
  assert.match(gpu, /prometheusPveConfigured/);
});

test("iKuai 子路由统一经过网络设备 gate", () => {
  const routes = read("../src/app/routes/network-routes.tsx");

  assert.match(routes, /IkuaiConfigurationGate/);

  for (const page of [
    "IkuaiDashboard",
    "IkuaiInterfaces",
    "IkuaiClients",
    "IkuaiVmMapping",
  ]) {
    assert.match(
      routes,
      new RegExp(`<IkuaiConfigurationGate[\\s\\S]*<${page} \\/>[\\s\\S]*<\\/IkuaiConfigurationGate>`)
    );
  }
});

test("PVE 和 OpenWrt 工作区有明确的未配置主状态", () => {
  const pveWorkspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");
  const openWrtWorkspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");

  assert.match(pveWorkspace, /pveNeedsSetup/);
  assert.match(pveWorkspace, /PveSetupPanel/);
  assert.match(openWrtWorkspace, /openWrtNeedsSetup/);
  assert.match(openWrtWorkspace, /OpenWrtSetupPanel/);
});

test("PVE 目标首屏等待接口返回后再选择未配置或工作区布局", () => {
  const pveWorkspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");

  assert.match(pveWorkspace, /const pveTargetsInitialLoading = targetsQ\.isLoading && !targetsQ\.data;/);
  assert.match(pveWorkspace, /const pveNeedsSetup = !pveTargetsInitialLoading && pveTargets\.length === 0;/);
  assert.match(pveWorkspace, /\{pveTargetsInitialLoading \? \(/);
  assert.match(pveWorkspace, /<PveTargetsLoadingPanel \/>/);
});

test("PVE 已有目标后的常规布局不默认展示新增连接表单", () => {
  const pveWorkspace = read("../src/features/compute/pve/pages/PveWorkspace.tsx");

  assert.doesNotMatch(pveWorkspace, /<aside className="space-y-4">\s*<TargetForm/);
  assert.match(pveWorkspace, /showCreateForm \? \(/);
});
