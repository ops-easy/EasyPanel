import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const routes = read("../src/app/routes/compute-routes.tsx");
const subnav = read("../src/features/compute/layout/ComputeSubNav.tsx");
const sidebar = read("../src/shared/layout/Sidebar.tsx");
const settings = read("../src/features/compute/pages/VirtualMachineSettings.tsx");
const runtimeSettings = read("../src/features/settings/components/SettingsRuntimeSection.tsx");

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
  for (const label of ["总览", "虚拟机 / CT", "宿主机 / 节点", "存储", "任务活动", "配置"]) {
    assert.match(subnav, new RegExp(label.replace("/", "\\/")));
  }

  for (const legacyLabel of ["vCenter / 虚拟机", "vCenter / 宿主机", "PVE 总览", "PVE 目标", "PVE 节点", "PVE 虚拟机", "PVE 存储", "PVE 任务", "虚拟机设置"]) {
    assert.doesNotMatch(subnav, new RegExp(legacyLabel.replace("/", "\\/")));
  }

  assert.match(subnav, /providerConfigured/);
  assert.match(subnav, /\/api\/pve\/targets/);
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

  assert.doesNotMatch(computeSidebar, /to="\/cluster\/compute\/pve\/dashboard"/);
  assert.doesNotMatch(computeSidebar, /to="\/cluster\/compute\/vcenter\/dashboard"/);
});

test("compute config page uses cards as the only inner navigation", () => {
  assert.doesNotMatch(settings, /TabsTrigger/);
  assert.doesNotMatch(settings, /TabsList/);
  assert.doesNotMatch(settings, /TabsContent/);
  assert.match(settings, /type SettingsConfigSection = "vcenter" \| "pve" \| "monitoring" \| "remote" \| "vmlog"/);
  assert.match(settings, /type="button"/);
  assert.match(settings, /onClick=\{\(\) => onSelect\(section\)\}/);
  assert.match(settings, /activeSection === card\.section/);
  assert.match(settings, /renderActivePanel/);
  assert.match(settings, /<PveTargetSettingsPanel \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="vcenter" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="monitoring" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="remote" \/>/);
  assert.match(settings, /<SettingsRuntimeSection variant="virtualMachine" focus="vmlog" \/>/);
});

test("virtual machine runtime settings can render focused real config panels", () => {
  assert.match(runtimeSettings, /export type SettingsRuntimeFocus = "all" \| "vcenter" \| "monitoring" \| "remote" \| "vmlog"/);
  assert.match(runtimeSettings, /focus\?: SettingsRuntimeFocus/);
  for (const marker of [
    "showVcenterSettings",
    "showMonitoringSettings",
    "showRemoteSettings",
    "showVmLogSettings",
  ]) {
    assert.match(runtimeSettings, new RegExp(marker));
  }
  assert.match(runtimeSettings, /showVcenterSettings = showVirtualMachine && \(vmFocus === "all" \|\| vmFocus === "vcenter"\)/);
  assert.match(runtimeSettings, /showMonitoringSettings = showVirtualMachine && \(vmFocus === "all" \|\| vmFocus === "monitoring"\)/);
  assert.match(runtimeSettings, /vcenterConsoleHost/);
  assert.match(runtimeSettings, /victoriaLogsUrl/);
  assert.match(runtimeSettings, /victoriaLogsRetentionDays/);
  assert.match(settings, /远程访问/);
});
