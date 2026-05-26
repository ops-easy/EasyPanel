import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

test("network model files exist and own shared UI models", () => {
  assert.equal(exists("../src/features/network/model/networkTypes.ts"), true);
  assert.equal(exists("../src/features/network/model/networkCapabilities.ts"), true);
  assert.equal(exists("../src/features/network/model/networkMappers.ts"), true);

  const types = read("../src/features/network/model/networkTypes.ts");
  for (const model of [
    "NetworkProviderSummary",
    "NetworkDeviceRow",
    "NetworkInterfaceRow",
    "NetworkClientRow",
    "NetworkWirelessRow",
    "NetworkFirewallGroup",
    "NetworkMonitoringCoverage",
    "NetworkProviderCapability",
    "NetworkResourceEmptyReason",
  ]) {
    assert.match(types, new RegExp(`export\\s+type\\s+${model}\\b|export\\s+interface\\s+${model}\\b`));
  }
});

test("network mappers own provider-specific transformations", () => {
  const mappers = read("../src/features/network/model/networkMappers.ts");
  for (const fn of [
    "mapIkuaiInterfaces",
    "mapOpenWrtInterfaces",
    "mapIkuaiClients",
    "mapOpenWrtClients",
    "mapOpenWrtWireless",
    "mapOpenWrtFirewallGroups",
    "mapMonitoringCoverage",
  ]) {
    assert.match(mappers, new RegExp(`export\\s+function\\s+${fn}\\b`));
  }
  assert.match(mappers, /默认策略/);
  assert.match(mappers, /防火墙区域/);
  assert.match(mappers, /端口转发/);
  assert.match(mappers, /访问规则/);
  assert.doesNotMatch(mappers, /name:\s*row\.section \|\| row\.key/);
});

test("OpenWrt interface mapper merges ubus ip-addr and legacy metric rows", () => {
  const mappers = read("../src/features/network/model/networkMappers.ts");

  assert.match(mappers, /interfaces\?: Array<Record<string, unknown>>;/);
  assert.match(mappers, /interfaceDump\?: \{ interface\?: Array<Record<string, unknown>> \};/);
  assert.match(mappers, /ipAddr\?: Array<Record<string, unknown>>;/);
  assert.match(mappers, /function openWrtInterfaceKeyCandidates/);
  assert.match(mappers, /const ipAddrRowsByKey = indexOpenWrtInterfaceRows\(data\?\.ipAddr/);
  assert.match(mappers, /const legacyRowsByKey = indexOpenWrtInterfaceRows\(data\?\.interfaces/);
  assert.match(mappers, /const baseRows = data\?\.interfaceDump\?\.interface\?\.length/);
  assert.match(mappers, /formatAddrInfoList\(ipAddrRow\?\.addr_info\)/);
  assert.match(mappers, /openWrtInterfaceRate\(item, legacyRow\)/);
  assert.doesNotMatch(mappers, /data\?\.interfaceDump\?\.interface\?\.length[\s\S]*: data\?\.interfaces\?\.length[\s\S]*: \(data\?\.ipAddr \?\? \[\]\)/);
});

test("OpenWrt firewall mapper turns UCI firewall sections into readable rows", () => {
  const mappers = read("../src/features/network/model/networkMappers.ts");

  for (const type of ["zone", "forwarding", "redirect", "rule", "nat"]) {
    assert.match(mappers, new RegExp(`type === "${type}"`));
  }

  for (const label of ["来源区", "目标区", "协议", "动作", "外部端口", "内部地址", "内部端口", "SNAT 地址", "当前连接数"]) {
    assert.match(mappers, new RegExp(label));
  }

  assert.doesNotMatch(mappers, /return value \? `\$\{key\}: \$\{value\}`/);
  assert.doesNotMatch(mappers, /detail:\s*Object\.keys\(options\)\.slice/);
});

test("large resource page no longer owns mapper implementation", () => {
  const page = read("../src/features/network/pages/NetworkResourcePage.tsx");
  assert.doesNotMatch(page, /function mapOpenWrtInterfaces/);
  assert.doesNotMatch(page, /function groupOpenWrtFirewallSections/);
  assert.match(page, /NetworkDevicesView/);
});
