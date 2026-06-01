import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const routes = read("../src/app/routes/compute-routes.tsx");
const subnav = read("../src/features/compute/layout/ComputeSubNav.tsx");
const sidebar = read("../src/shared/layout/Sidebar.tsx");
const settings = read("../src/features/compute/pages/VirtualMachineSettings.tsx");
const runtimeSettings = read("../src/features/settings/components/SettingsRuntimeSection.tsx");
const resourcePage = read("../src/features/compute/pages/ComputeResourcePage.tsx");
const pveTargetSettings = read("../src/features/compute/pve/components/PveTargetSettingsPanel.tsx");

test("compute workspace exposes resource-first routes", () => {
  for (const path of [
    'path="guests"',
    'path="hosts"',
    'path="storage"',
    'path="activity"',
    'path="config"',
  ]) {
    assert.match(routes, new RegExp(path.replaceAll("/", "\\/")));
  }

  assert.match(routes, /path="vcenter\/vms"[\s\S]*to="\/cluster\/compute\/guests"/);
  assert.match(routes, /path="vcenter\/hosts"[\s\S]*to="\/cluster\/compute\/hosts"/);
  assert.match(routes, /path="pve\/guests"[\s\S]*to="\/cluster\/compute\/guests"/);
  assert.match(routes, /path="pve\/nodes"[\s\S]*to="\/cluster\/compute\/hosts"/);
  assert.match(routes, /path="pve\/storage"[\s\S]*to="\/cluster\/compute\/storage"/);
  assert.match(routes, /path="pve\/tasks"[\s\S]*to="\/cluster\/compute\/activity"/);
});

test("compute navigation is resource-first and keeps unconfigured providers out of daily nav", () => {
  for (const label of ["Dashboard", "虚拟机 / CT", "宿主机 / 节点", "存储", "任务活动", "配置"]) {
    assert.match(subnav, new RegExp(label.replace("/", "\\/")));
  }

  for (const legacyLabel of ["vCenter / 虚拟机", "vCenter / 宿主机", "PVE 总览", "PVE 目标", "PVE 节点", "PVE 虚拟机", "PVE 存储", "PVE 任务", "虚拟机设置"]) {
    assert.doesNotMatch(subnav, new RegExp(legacyLabel.replace("/", "\\/")));
  }

  assert.match(subnav, /providerConfigured/);
  assert.match(subnav, /\/api\/pve\/targets/);
  assert.match(subnav, /queryKey: \["compute-subnav-cloud-vm-instances"\]/);
  assert.match(subnav, /\/api\/app-center\/cloud-vm\/instances/);
  assert.match(subnav, /const cloudVmCount = cloudVmQ\.data\?\.instances\?\.length \?\? 0;/);
  assert.match(subnav, /const hasVirtualizedProviders = Boolean\(cfgQ\.data\?\.vcenterConfigured === true \|\| pveTargetCount > 0\);/);
  assert.match(subnav, /const providerConfigured = Boolean\(hasVirtualizedProviders \|\| cloudVmCount > 0\);/);
  assert.match(subnav, /if \(hasVirtualizedProviders\) base\.push\(\.\.\.resourceLinks\);/);
  assert.doesNotMatch(subnav, /if \(providerConfigured\) base\.push\(\.\.\.resourceLinks\);/);
  assert.match(subnav, /to: "\/cluster\/apps\/cloud-vm", label: "容器主机"/);
  assert.match(subnav, /vcenterConfigured/);
});

test("sidebar mirrors the resource-first compute navigation", () => {
  const computeSidebar = sidebar.slice(
    sidebar.indexOf("showComputeNav && isCompute"),
    sidebar.indexOf("showNetworkNav && isNetwork")
  );

  for (const to of [
    'to="/cluster/compute/guests"',
    'to="/cluster/compute/hosts"',
    'to="/cluster/compute/storage"',
    'to="/cluster/compute/activity"',
    'to="/cluster/compute/config"',
  ]) {
    assert.match(computeSidebar, new RegExp(to.replaceAll("/", "\\/")));
  }

  assert.doesNotMatch(computeSidebar, /to="\/cluster\/compute\/dashboard"/);
  assert.doesNotMatch(computeSidebar, /to="\/cluster\/compute\/pve\/dashboard"/);
  assert.doesNotMatch(computeSidebar, /to="\/cluster\/compute\/vcenter\/dashboard"/);
});

test("compute config page uses cards as the only inner navigation", () => {
  assert.doesNotMatch(settings, /TabsTrigger/);
  assert.doesNotMatch(settings, /TabsList/);
  assert.doesNotMatch(settings, /TabsContent/);
  assert.match(settings, /type SettingsConfigSection = "vcenter" \| "pve" \| "monitoring" \| "idrac" \| "vmlog"/);
  assert.match(settings, /type="button"/);
  assert.match(settings, /onClick=\{\(\) => onSelect\(section\)\}/);
  assert.match(settings, /activeSection === card\.section/);
  assert.match(settings, /renderActivePanel/);
  assert.match(settings, /<PveTargetSettingsPanel \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="vcenter" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="monitoring" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="idrac" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="vmlog" \/>/);
});

test("compute user-facing copy reads like configured resources instead of unfinished access setup", () => {
  assert.match(resourcePage, /状态概览/);
  assert.match(resourcePage, /还没有配置 vCenter 或 PVE/);
  assert.doesNotMatch(resourcePage, /健康示例|还没有接入 vCenter 或 PVE/);

  assert.match(settings, /return \{ label: "已配置", health: "ok" as ComputeHealth \};/);
  assert.match(settings, /title: "PVE 目标"/);
  assert.match(settings, /description: "宿主机带外 Redfish 配置，多台 iDRAC 目标统一维护。"/);
  assert.doesNotMatch(settings, /已接入|PVE 接入|Redfish 接入/);

  assert.match(pveTargetSettings, /const targetStatus = active \? "已配置" : targetsQ\.isLoading \? "读取中" : "未配置";/);
  assert.match(pveTargetSettings, /当前 PVE 目标/);
  assert.doesNotMatch(pveTargetSettings, /已接入|当前接入目标/);
});

test("virtual machine runtime settings can render focused real config panels", () => {
  assert.match(runtimeSettings, /export type SettingsRuntimeFocus = "all" \| "vcenter" \| "monitoring" \| "idrac" \| "vmlog"/);
  assert.match(runtimeSettings, /focus\?: SettingsRuntimeFocus/);
  for (const marker of [
    "showVcenterSettings",
    "showMonitoringSettings",
    "showIdracSettings",
    "showVmLogSettings",
  ]) {
    assert.match(runtimeSettings, new RegExp(marker));
  }
  assert.match(runtimeSettings, /showVcenterSettings = showVirtualMachine && \(vmFocus === "all" \|\| vmFocus === "vcenter"\)/);
  assert.match(runtimeSettings, /showMonitoringSettings = showVirtualMachine && \(vmFocus === "all" \|\| vmFocus === "monitoring"\)/);
  assert.match(runtimeSettings, /idracTargets/);
  assert.match(runtimeSettings, /addIdracTarget/);
  assert.doesNotMatch(runtimeSettings, /vcenterVmSshUser/);
  assert.doesNotMatch(runtimeSettings, /SFTP/);
  assert.match(runtimeSettings, /victoriaLogsUrl/);
  assert.match(runtimeSettings, /victoriaLogsRetentionDays/);
  assert.match(settings, /iDRAC 配置/);
});
