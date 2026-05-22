import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

const routes = read("../src/app/routes/network-routes.tsx");
const subnav = read("../src/features/network/layout/NetworkSubNav.tsx");
const dashboard = read("../src/features/network/pages/NetworkDashboard.tsx");
const sidebar = read("../src/shared/layout/Sidebar.tsx");

test("network routes expose resource-first pages and redirect legacy vendor routes", () => {
  assert.match(routes, /const NetworkResourcePage = lazy/);
  assert.match(routes, /const NetworkConfigPage = lazy/);

  for (const view of ["devices", "interfaces", "clients", "wireless", "connections", "monitoring"]) {
    assert.match(routes, new RegExp(`path="${view}"[\\s\\S]*<NetworkResourcePage view="${view}" \\/>`));
  }
  assert.match(routes, /path="config"[\s\S]*<NetworkConfigPage \/>/);

  for (const [legacy, target] of [
    ["ikuai/dashboard", "/cluster/network/devices?provider=ikuai"],
    ["ikuai/interfaces", "/cluster/network/interfaces?provider=ikuai"],
    ["ikuai/clients", "/cluster/network/clients?provider=ikuai"],
    ["ikuai/vm-mapping", "/cluster/network/clients?provider=ikuai"],
    ["ikuai/exporter", "/cluster/network/monitoring?provider=ikuai"],
    ["openwrt/dashboard", "/cluster/network/devices?provider=openwrt"],
    ["openwrt/interfaces", "/cluster/network/interfaces?provider=openwrt"],
    ["openwrt/clients", "/cluster/network/clients?provider=openwrt"],
    ["openwrt/wireless", "/cluster/network/wireless?provider=openwrt"],
    ["openwrt/connections", "/cluster/network/connections?provider=openwrt"],
    ["openwrt/exporter", "/cluster/network/monitoring?provider=openwrt"],
  ]) {
    assert.match(
      routes,
      new RegExp(`path="${legacy.replace("/", "\\/")}"[\\s\\S]*to="${target.replace(/[?]/g, "\\?")}"`),
      `${legacy} should redirect to ${target}`,
    );
  }
});

test("network navigation is organized by resources instead of vendors", () => {
  for (const path of [
    "/cluster/network/dashboard",
    "/cluster/network/devices",
    "/cluster/network/interfaces",
    "/cluster/network/clients",
    "/cluster/network/wireless",
    "/cluster/network/connections",
    "/cluster/network/monitoring",
    "/cluster/network/config",
  ]) {
    assert.match(subnav, new RegExp(`to:\\s*["']${path}`));
    assert.match(sidebar, new RegExp(`to="${path}"`));
  }

  for (const oldLabel of [
    "iKuai 总览",
    "iKuai 接口",
    "iKuai 客户端",
    "OpenWrt 接口",
    "OpenWrt 客户端",
    "OpenWrt 无线",
    "数据源",
  ]) {
    assert.doesNotMatch(subnav, new RegExp(oldLabel));
  }
});

test("network dashboard is an entry workspace without permanent setup forms or raw payloads", () => {
  assert.match(dashboard, /网络资源中心/);
  assert.match(dashboard, /NetworkResourceCard/);
  assert.match(dashboard, /\/cluster\/network\/devices/);
  assert.match(dashboard, /\/cluster\/network\/config/);

  assert.doesNotMatch(dashboard, /DeviceConfigurationPanel/);
  assert.doesNotMatch(dashboard, /<Input\b/);
  assert.doesNotMatch(dashboard, /OpenWrt 指标族/);
  assert.doesNotMatch(dashboard, /正在查看/);
  assert.doesNotMatch(dashboard, /RawDataDisclosure/);
  assert.doesNotMatch(dashboard, /JSON\.stringify/);
});

test("network resource and config pages exist with explicit UI models", () => {
  assert.equal(exists("../src/features/network/pages/NetworkResourcePage.tsx"), true);
  assert.equal(exists("../src/features/network/pages/NetworkConfigPage.tsx"), true);

  const resource = read("../src/features/network/pages/NetworkResourcePage.tsx");
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  for (const model of [
    "NetworkProviderSummary",
    "NetworkDeviceRow",
    "NetworkInterfaceRow",
    "NetworkClientRow",
    "NetworkWirelessRow",
    "NetworkConnectionRow",
    "NetworkMonitoringFamily",
  ]) {
    assert.match(resource, new RegExp(`type\\s+${model}\\b|interface\\s+${model}\\b`));
  }

  assert.match(resource, /type NetworkResourceView = "devices" \| "interfaces" \| "clients" \| "wireless" \| "connections" \| "monitoring"/);
  assert.match(resource, /useSearchParams/);
  assert.match(resource, /provider=openwrt|provider=ikuai|providerParam/);
  assert.match(resource, /RawDataDisclosure/);

  for (const label of ["iKuai 数据源", "OpenWrt 接入", "监控标签"]) {
    assert.match(config, new RegExp(label));
  }
  assert.match(config, /OpenWrtInstancePanel/);
  assert.match(config, /OPENWRT_PROBE_ENDPOINT|openwrt\/probe/);
});

test("network takeover config is exposed through resource editor and provider adapters", () => {
  assert.equal(exists("../src/features/network/pages/NetworkConfigEditor.tsx"), true);

  const resource = read("../src/features/network/pages/NetworkResourcePage.tsx");
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");
  const editor = read("../src/features/network/pages/NetworkConfigEditor.tsx");

  for (const model of [
    "NetworkConfigDomain",
    "NetworkConfigSnapshot",
    "NetworkChangeSet",
    "NetworkChangePreview",
    "NetworkApplyResult",
    "NetworkMonitoringCoverage",
  ]) {
    assert.match(resource, new RegExp(`type\\s+${model}\\b|interface\\s+${model}\\b|export\\s+type\\s+${model}\\b`));
  }

  assert.match(resource, /NetworkConfigEditor/);
  assert.match(editor, /\/api\/network\/devices\/\$\{encodeURIComponent\(deviceId\)\}\/\$\{provider\}\/config\/\$\{domain\}/);
  assert.match(editor, /\/config\/\$\{domain\}\/dry-run/);
  assert.match(editor, /\/config\/\$\{domain\}\/apply/);
  assert.match(editor, /confirm/);
  assert.match(editor, /RawDataDisclosure/);

  for (const field of ["apiUrl", "host", "port", "username", "password", "skipTlsVerify", "authType"]) {
    assert.match(config, new RegExp(field));
  }
  assert.match(config, /IKUAI_PROBE_ENDPOINT/);
  assert.match(config, /\/api\/network\/devices\/ikuai\/probe/);
  assert.match(config, /http-web/);
});
