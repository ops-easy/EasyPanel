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

test("network access setup is named separately from router configuration actions", () => {
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");
  const editor = read("../src/features/network/pages/NetworkConfigEditor.tsx");
  const drawer = read("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx");

  assert.match(subnav, /接入设置/);
  assert.match(sidebar, /接入设置/);
  assert.doesNotMatch(subnav, /label:\s*"配置"/);
  assert.match(config, /网络接入设置/);

  assert.match(editor, /NetworkRouterConfigDrawer/);
  assert.match(drawer, /路由器配置接管/);
  assert.match(drawer, /请先在接入设置页接入 iKuai 或 OpenWrt/);
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
  assert.equal(exists("../src/features/network/model/networkTypes.ts"), true);

  const resource = read("../src/features/network/pages/NetworkResourcePage.tsx");
  const types = read("../src/features/network/model/networkTypes.ts");
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  for (const model of [
    "NetworkProviderSummary",
    "NetworkDeviceRow",
    "NetworkInterfaceRow",
    "NetworkClientRow",
    "NetworkWirelessRow",
    "NetworkFirewallGroup",
    "NetworkMonitoringFamily",
  ]) {
    assert.match(types, new RegExp(`export\\s+type\\s+${model}\\b|export\\s+interface\\s+${model}\\b`));
  }

  assert.match(types, /export type NetworkResourceView = "devices" \| "interfaces" \| "clients" \| "wireless" \| "connections" \| "monitoring"/);
  assert.match(resource, /useSearchParams/);
  assert.match(resource, /provider=openwrt|provider=ikuai|providerParam/);
  assert.match(resource, /NetworkDevicesView/);

  for (const label of ["iKuai 数据源", "OpenWrt 接入", "监控标签"]) {
    assert.match(config, new RegExp(label));
  }
  assert.match(config, /OpenWrtInstancePanel/);
  assert.match(config, /OPENWRT_PROBE_ENDPOINT|openwrt\/probe/);
});

test("network resource pages do not block usable rows behind unrelated slow provider calls", () => {
  const queries = read("../src/features/network/hooks/useNetworkResourceQueries.ts");

  assert.match(queries, /const viewLoading\b/);
  assert.match(queries, /const backgroundLoading\b/);
  assert.match(queries, /rowsLength === 0 && viewLoading/);
  assert.doesNotMatch(queries, /const loading =\s*[\s\S]*ikuaiStreamQ\.isLoading[\s\S]*openWrtFirewallQ\.isLoading/);
});

test("network interface resource page maps OpenWrt SSH ubus payloads", () => {
  const mappers = read("../src/features/network/model/networkMappers.ts");
  const openWrtWorkspace = read("../src/features/network/openwrt/pages/OpenWrtWorkspace.tsx");

  assert.match(openWrtWorkspace, /interfaceDump\?: \{ interface\?: Array<Record<string, unknown>> \}/);
  assert.match(mappers, /interfaceDump\?: \{ interface\?: Array<Record<string, unknown>> \}/);
  assert.match(mappers, /data\?\.interfaceDump\?\.interface/);
  assert.match(mappers, /formatIPv4List\(item\["ipv4-address"\]\)/);
});

test("network firewall resource page summarizes OpenWrt UCI instead of showing raw section keys", () => {
  const mappers = read("../src/features/network/model/networkMappers.ts");
  const view = read("../src/features/network/views/NetworkFirewallView.tsx");

  assert.match(subnav, /label: "防火墙"/);
  assert.match(sidebar, />防火墙</);
  assert.match(view, /防火墙/);
  assert.match(mappers, /groupOpenWrtFirewallSections/);
  assert.match(mappers, /summarizeOpenWrtFirewallSection/);
  assert.match(mappers, /端口转发|防火墙区域|访问规则|连接跟踪/);
  assert.doesNotMatch(mappers, /name:\s*row\.section \|\| row\.key \|\| "firewall"/);
  assert.doesNotMatch(mappers, /detail:\s*row\.key \|\| row\.option \|\| "firewall config"/);
});

test("network monitoring page consolidates missing collector hints outside table rows", () => {
  const view = read("../src/features/network/views/NetworkMonitoringView.tsx");

  assert.match(view, /const monitoringHints\b/);
  assert.match(view, /缺失建议|监控补全建议/);
  assert.doesNotMatch(view, /row\.hints\?\.length[\s\S]*row\.hints\.join/);
});

test("network config page opens the configured provider and avoids raw field labels", () => {
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  assert.match(config, /activeSectionTouched/);
  assert.match(config, /!ikuaiDevice && openWrtDevice/);
  assert.match(config, /handleSectionChange/);
  assert.match(config, /跳过 TLS 校验/);
});

test("network config layout keeps section tabs compact across provider forms", () => {
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");
  const openWrtTarget = read("../src/features/network/openwrt/pages/OpenWrtTargetPanel.tsx");
  const openWrtActions = read("../src/features/network/openwrt/pages/OpenWrtActionPanel.tsx");

  assert.match(config, /lg:grid-cols-\[minmax\(0,20rem\)_minmax\(0,1fr\)\][^"]*items-start/);
  assert.match(config, /grid content-start gap-2 self-start/);
  assert.match(config, /min-w-0 overflow-hidden space-y-5/);
  assert.match(openWrtTarget, /rounded-lg[^"]*min-w-0[^"]*overflow-hidden/);
  assert.match(openWrtTarget, /grid-cols-\[minmax\(0,1fr\)_88px\]/);
  assert.match(openWrtActions, /rounded-lg[^"]*min-w-0[^"]*overflow-hidden/);
});

test("network access setup page does not mix in router configuration actions", () => {
  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");

  assert.match(config, /网络接入设置/);
  assert.match(config, /接入信息/);
  assert.match(config, /OpenWrt 接入/);
  assert.match(config, /本页只维护平台接入信息/);
  assert.match(config, /路由器配置请从资源页进入/);
  assert.doesNotMatch(config, /NetworkRouterConfigDrawer/);
  assert.doesNotMatch(config, /NetworkConfigEditor/);
  assert.doesNotMatch(config, /OpenWrtActionPanel/);
  assert.doesNotMatch(config, /OpenWrtConfigDiffDialog/);
  assert.doesNotMatch(config, /runOpenWrtAction/);
  assert.doesNotMatch(config, /配置变更/);
  assert.doesNotMatch(config, /dry-run|Dry-run|确认应用|UCI 配置项|func_name|重载网络|重启 dnsmasq/);
});

test("network takeover config is exposed through resource editor and provider adapters", () => {
  assert.equal(exists("../src/features/network/pages/NetworkConfigEditor.tsx"), true);
  assert.equal(exists("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx"), true);

  const config = read("../src/features/network/pages/NetworkConfigPage.tsx");
  const editor = read("../src/features/network/pages/NetworkConfigEditor.tsx");
  const drawer = read("../src/features/network/router-config/NetworkRouterConfigDrawer.tsx");
  const types = read("../src/features/network/model/networkTypes.ts");

  for (const model of [
    "NetworkConfigDomain",
    "NetworkConfigSnapshot",
    "NetworkChangeSet",
    "NetworkChangePreview",
    "NetworkApplyResult",
    "NetworkMonitoringCoverage",
  ]) {
    assert.match(types, new RegExp(`type\\s+${model}\\b|interface\\s+${model}\\b|export\\s+type\\s+${model}\\b`));
  }

  assert.match(editor, /NetworkRouterConfigDrawer/);
  assert.match(drawer, /\/api\/network\/devices\/\$\{encodeURIComponent\(deviceId\)\}\/\$\{selectedProvider\}\/config\/\$\{domain\}/);
  assert.match(drawer, /\/config\/\$\{domain\}\/dry-run/);
  assert.match(drawer, /\/config\/\$\{domain\}\/apply/);
  assert.match(drawer, /confirm/);
  assert.match(drawer, /RawDataDisclosure/);

  for (const field of ["apiUrl", "host", "port", "username", "password", "skipTlsVerify", "authType"]) {
    assert.match(config, new RegExp(field));
  }
  assert.match(config, /IKUAI_PROBE_ENDPOINT/);
  assert.match(config, /\/api\/network\/devices\/ikuai\/probe/);
  assert.match(config, /http-web/);
});

test("network resource queries are view-scoped hooks", () => {
  const queries = read("../src/features/network/hooks/useNetworkResourceQueries.ts");
  const page = read("../src/features/network/pages/NetworkResourcePage.tsx");

  assert.match(queries, /export function useNetworkResourceQueries/);
  assert.match(queries, /view === "interfaces"/);
  assert.match(queries, /view === "clients"/);
  assert.match(queries, /view === "wireless"/);
  assert.match(queries, /view === "connections"/);
  assert.doesNotMatch(page, /useQuery\(\{\s*queryKey:\s*\["network-resource"/);
});

test("network resource shell centralizes filters loading errors and raw disclosure", () => {
  const shell = read("../src/features/network/components/NetworkResourceShell.tsx");
  const strip = read("../src/features/network/components/NetworkProviderStrip.tsx");

  assert.match(shell, /NetworkProviderStrip/);
  assert.match(shell, /RawDataDisclosure/);
  assert.match(shell, /NetworkErrorList/);
  assert.match(shell, /搜索名称、IP、MAC、接口/);
  assert.match(strip, /buildNetworkProviderCapability/);
});

test("network dashboard separates access health from router config entry", () => {
  assert.match(dashboard, /接入源健康/);
  assert.match(dashboard, /资源入口/);
  assert.match(dashboard, /路由器配置/);
  assert.match(dashboard, /接入设置/);
  assert.doesNotMatch(dashboard, /<Input\b|<Textarea\b|JSON\.stringify/);
});
