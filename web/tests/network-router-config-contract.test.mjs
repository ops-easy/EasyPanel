import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

test("router configuration drawer is separated from access setup", () => {
  assert.equal(exists("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx"), true);
  const drawer = read("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx");
  const access = read("../src/features/network/pages/NetworkConfigPage.tsx");

  assert.match(drawer, /路由器配置接管/);
  assert.match(drawer, /生成预览/);
  assert.match(drawer, /确认应用/);
  assert.match(drawer, /高级模式/);
  assert.doesNotMatch(access, /路由器配置接管|生成预览|确认应用|高级模式/);
});

test("resource views expose context-specific configuration actions", () => {
  for (const [file, label] of [
    ["NetworkInterfacesView.tsx", "配置接口"],
    ["NetworkClientsView.tsx", "配置终端策略"],
    ["NetworkWirelessView.tsx", "配置无线"],
    ["NetworkFirewallView.tsx", "配置防火墙"],
    ["NetworkMonitoringView.tsx", "配置采集"],
  ]) {
    const source = read(`../src/features/network/views/${file}`);
    assert.match(source, new RegExp(label));
    assert.match(source, /NetworkRouterConfigDrawer/);
  }
});

test("router config drawer defaults to structured forms with advanced fallback", () => {
  const drawer = read("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx");
  const openwrt = read("../src/features/network/router-config/OpenWrtStructuredConfigForm.tsx");
  const ikuai = read("../src/features/network/router-config/IkuaiStructuredConfigForm.tsx");
  const advanced = read("../src/features/network/router-config/AdvancedProviderConfigForm.tsx");

  assert.match(drawer, /RouterConfigDomainPicker/);
  assert.match(drawer, /RouterConfigSnapshotPanel/);
  assert.match(drawer, /RouterChangePreviewPanel/);
  assert.match(drawer, /高级模式/);
  assert.match(openwrt, /接口地址|DHCP|无线|防火墙|DNS|服务操作/);
  assert.match(ikuai, /终端备注|限速|端口映射|DHCP/);
  assert.match(advanced, /UCI 配置项/);
  assert.match(advanced, /iKuai func_name/);
});

test("router config drawer gates writes and raw data", () => {
  const drawer = read("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx");
  assert.match(drawer, /canWrite/);
  assert.match(drawer, /canViewRaw/);
  assert.match(drawer, /RawDataDisclosure/);
  assert.match(drawer, /confirm=true/);
});
