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

test("large resource page no longer owns mapper implementation", () => {
  const page = read("../src/features/network/pages/NetworkResourcePage.tsx");
  assert.doesNotMatch(page, /function mapOpenWrtInterfaces/);
  assert.doesNotMatch(page, /function groupOpenWrtFirewallSections/);
  assert.match(page, /NetworkDevicesView/);
});
