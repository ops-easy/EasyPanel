import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const workspaceSource = read("../src/lib/workspace.ts");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");
const computeSubNavSource = read("../src/features/compute/layout/ComputeSubNav.tsx");
const computeRoutesSource = read("../src/app/routes/compute-routes.tsx");
const computeDashboardSource = read("../src/features/compute/pages/ComputeDashboard.tsx");
const networkDashboardSource = read("../src/features/network/pages/NetworkDashboard.tsx");
const vcenterRoutesSource = read("../src/app/routes/vcenter-routes.tsx");
const clusterRoutesSource = read("../src/app/routes/cluster-routes.tsx");
const clusterLayoutSource = read("../src/features/cluster/pages/ClusterLayout.tsx");
const vcenterHubSource = read("../src/features/vcenter/pages/VCenterHubDashboard.tsx");
const globalSearchSource = read("../src/shared/layout/GlobalSearchBar.tsx");
const mobileLayoutSource = read("../src/shared/layout/AppLayoutMobile.tsx");
const headerSource = read("../src/shared/layout/Header.tsx");
const homeHubSource = read("../src/pages/HomeHub.tsx");
const platformPermissionsSource = read("../src/lib/platform-permissions.ts");
const platformUsersSource = read("../src/features/account/pages/PlatformUsers.tsx");
const vcenterListSource = read("../src/features/vcenter/pages/VCenterList.tsx");
const vcenterTypesSource = read("../src/features/vcenter/pages/types.ts");
const ikuaiRouterSource = read("../src/features/vcenter/pages/VCenterIkuaiRouterPage.tsx");

function assertInOrder(source, needles, message) {
  let previous = -1;
  for (const needle of needles) {
    const current = source.indexOf(needle);
    assert.ok(current >= 0, `${message}: missing ${needle}`);
    assert.ok(current > previous, `${message}: ${needle} is out of order`);
    previous = current;
  }
}

test("sidebar and mobile active states do not highlight parent dashboards together with child pages", () => {
  assert.doesNotMatch(
    sidebarSource,
    /if \(ws === "baota"\) \{\s+return pathname\.startsWith\("\/cluster\/baota"\);/
  );
  assert.match(
    sidebarSource,
    /if \(ws === "baota"\) \{\s+return pathname === "\/cluster\/baota" \|\| pathname === "\/cluster\/baota\/";\s+\}/
  );

  assert.doesNotMatch(
    sidebarSource,
    /location\.pathname\.startsWith\("\/cluster\/network"\) && !location\.pathname\.startsWith\("\/cluster\/network\/ikuai"\)/
  );
  assert.match(sidebarSource, /const networkIkuaiActive =/);
  assert.match(sidebarSource, /const networkOpenWrtActive =/);

  assert.doesNotMatch(
    mobileLayoutSource,
    /pathname === to \|\| pathname\.startsWith\(to \+ "\/"\) \|\| pathname\.startsWith\(to \+ "\?"\)/
  );
  assert.match(mobileLayoutSource, /function isBottomTabActive/);
  assert.match(mobileLayoutSource, /pathname\.startsWith\("\/cluster\/compute"\)/);
  assert.match(mobileLayoutSource, /pathname\.startsWith\("\/cluster\/apps\/"\)/);
});

test("compute sidebar follows the same coarse order as compute top navigation", () => {
  const computeSidebar = sidebarSource.slice(
    sidebarSource.indexOf("showComputeNav && isCompute"),
    sidebarSource.indexOf("showNetworkNav && isNetwork")
  );
  assertInOrder(
    computeSidebar,
    [
      'to="/cluster/compute/vcenter/dashboard"',
      'to="/cluster/compute/vcenter/vms"',
      'to="/cluster/compute/vcenter/hosts"',
      'to="/cluster/compute/vcenter/gpu"',
      'to="/cluster/compute/pve/dashboard"',
      'to="/cluster/compute/cloud"',
      'to="/cluster/bastion"',
      'to="/cluster/compute/tools/ip-scan"',
    ],
    "compute sidebar"
  );
});

test("header workspace switcher opens bastion module home before terminal sessions", () => {
  assert.doesNotMatch(headerSource, /navigate\("\/cluster\/bastion\/session"\)/);
  assert.match(headerSource, /navigate\("\/cluster\/bastion"\)/);
  assert.doesNotMatch(headerSource, /vCenter 终端|应用中心 SSH\/Redis/);
  assert.match(headerSource, /SSH \/ RDP \/ Redis CLI/);
});

test("legacy vCenter paths belong to the unified compute workspace", () => {
  assert.match(workspaceSource, /pathname\.startsWith\("\/cluster\/vcenter"\)\) return "compute"/);
  assert.doesNotMatch(workspaceSource, /\|\s*"vcenter"/);
  assert.match(sidebarSource, /path\.startsWith\("\/cluster\/vcenter"\)\) \{\s+setWorkspace\("compute"\)/);
  assert.doesNotMatch(sidebarSource, /workspace === "vcenter"/);
  assert.doesNotMatch(sidebarSource, /case "vcenter"/);
  assert.doesNotMatch(headerSource, /const isVcenter =/);
  assert.match(clusterLayoutSource, /isLegacyVCenterSection/);
  assert.doesNotMatch(clusterLayoutSource, /isVCenterSection|isLegacyIkuaiRouter|vSphere \/ vCenter/);
});

test("new compute and network workspaces have independent permission visibility", () => {
  assert.match(platformPermissionsSource, /"compute" \| "network"/);
  assert.match(platformPermissionsSource, /case "compute":[\s\S]*moduleVisible\(p, "compute"\)/);
  assert.match(platformPermissionsSource, /case "network":[\s\S]*moduleVisible\(p, "network"\)/);
  assert.match(headerSource, /workspaceMenuVisible\(perm, "compute", navRole\)/);
  assert.match(headerSource, /workspaceMenuVisible\(perm, "network", navRole\)/);
  assert.match(sidebarSource, /workspaceMenuVisible\(perm, "compute", navRole\)/);
  assert.match(sidebarSource, /workspaceMenuVisible\(perm, "network", navRole\)/);
  assert.match(homeHubSource, /workspaceMenuVisible\(perm, "compute", hubRole\)/);
  assert.match(homeHubSource, /workspaceMenuVisible\(perm, "network", hubRole\)/);
  assert.match(platformUsersSource, /compute: ModuleAccess/);
  assert.match(platformUsersSource, /network: ModuleAccess/);
  assert.match(platformUsersSource, /vcenter: form\.compute/);
  assert.doesNotMatch(platformUsersSource, /label="vCenter"/);
  assert.doesNotMatch(headerSource, /headerShowNetwork = menuItemVisible\(perm, "network", navRole, moduleVisible\(perm, "vcenter"\)\)/);
  assert.doesNotMatch(sidebarSource, /showNetworkNav = menuItemVisible\(perm, "network", navRole, moduleVisible\(perm, "vcenter"\)\)/);
  assert.doesNotMatch(homeHubSource, /showNetwork = menuItemVisible\(perm, "network", hubRole, moduleVisible\(perm, "vcenter"\)\)/);
});

test("IP scan has a compute-owned route and legacy routes redirect to it", () => {
  assert.match(computeRoutesSource, /path="tools\/ip-scan"[\s\S]*<ToolNetworkIpScan \/>/);
  assert.match(vcenterRoutesSource, /path="vcenter\/tools\/ip-scan"[\s\S]*to="\/cluster\/compute\/tools\/ip-scan"/);
  assert.match(clusterRoutesSource, /path="tools\/ip-scan"[\s\S]*to="\/cluster\/compute\/tools\/ip-scan"/);
});

test("legacy vCenter routes redirect before falling through to VM details", () => {
  assert.match(vcenterRoutesSource, /path="vcenter\/prometheus"[\s\S]*to="\/cluster\/compute\/vcenter\/dashboard"/);
  assert.match(vcenterRoutesSource, /path="vcenter\/router"[\s\S]*to="\/cluster\/network\/ikuai\/dashboard"/);
  assert.match(vcenterRoutesSource, /path="vcenter"[\s\S]*to="\/cluster\/compute\/vcenter\/vms"/);
  assert.match(vcenterRoutesSource, /path="vcenter\/:moref"[\s\S]*<LegacyVcenterVmRedirect \/>/);
  assert.ok(
    vcenterRoutesSource.indexOf('path="vcenter/prometheus"') <
      vcenterRoutesSource.indexOf('path="vcenter/:moref"'),
    "legacy vcenter/prometheus must be declared before vcenter/:moref"
  );
});

test("header and home hub entries use the same permission gates as sidebar", () => {
  assert.match(headerSource, /const headerShowK8s = workspaceMenuVisible\(perm, "kubernetes", navRole\)/);
  assert.match(sidebarSource, /const showK8sNav = workspaceMenuVisible\(perm, "kubernetes", navRole\)/);
  assert.match(homeHubSource, /const showK8s = workspaceMenuVisible\(perm, "kubernetes", hubRole\)/);
  assert.match(headerSource, /\{headerShowK8s \? \(/);
  assert.doesNotMatch(headerSource, /\{moduleVisible\(perm, "k8s"\) \? \(/);
  assert.match(homeHubSource, /enabled: cfg\?\.k8sConfigured === true && showK8s/);
  assert.match(homeHubSource, /enabled: cfg\?\.vcenterConfigured === true && showVc/);
  assert.match(homeHubSource, /enabled: loggedIn && showNetwork/);
});

test("home hub keeps Kubernetes and compute cards summarized before configuration", () => {
  const k8sStart = homeHubSource.indexOf("{showK8s && (");
  const computeStart = homeHubSource.indexOf("{showVc && (");
  const networkStart = homeHubSource.indexOf("{showNetwork && (");
  assert.ok(k8sStart >= 0, "Kubernetes hub card should exist");
  assert.ok(computeStart > k8sStart, "compute hub card should follow Kubernetes card");
  assert.ok(networkStart > computeStart, "network hub card should follow compute card");

  const k8sCard = homeHubSource.slice(k8sStart, computeStart);
  const computeCard = homeHubSource.slice(computeStart, networkStart);
  assert.doesNotMatch(k8sCard, /\{k8sOk && \(/);
  assert.doesNotMatch(computeCard, /\{vcOk && \(/);
  assert.match(k8sCard, /<MetricItem/);
  assert.match(computeCard, /<MetricItem/);
});

test("main shell surfaces PVE and OpenWrt setup status before drilling in", () => {
  assert.match(sidebarSource, /apiGetJson<\{ targets: PVETarget\[\] \}>\("\/api\/pve\/targets"/);
  assert.match(sidebarSource, /apiGetJson<\{ devices: NetworkDevice\[\] \}>\("\/api\/network\/devices"/);
  assert.match(sidebarSource, /PVE 未配置/);
  assert.match(sidebarSource, /OpenWrt 未配置/);

  assert.match(homeHubSource, /PVE 未配置/);
  assert.match(homeHubSource, /OpenWrt 未配置/);
  assert.match(homeHubSource, /\/api\/pve\/targets/);
  assert.match(homeHubSource, /\/api\/network\/devices/);

  assert.match(computeDashboardSource, /\/api\/pve\/targets/);
  assert.match(computeDashboardSource, /配置 PVE 目标|PVE 未配置/);

  assert.match(networkDashboardSource, /\/api\/network\/devices/);
  assert.match(networkDashboardSource, /配置 OpenWrt|OpenWrt 未配置/);
});

test("network workspace does not link internal toolbox back into vCenter", () => {
  assert.doesNotMatch(sidebarSource, /showVcTools[\s\S]{0,240}to="\/cluster\/vcenter\/tools\/ip-scan"/);
  assert.doesNotMatch(sidebarSource, /<span>爱快路由<\/span>/);
});

test("virtualization VM list does not embed network-device monitoring", () => {
  assert.doesNotMatch(vcenterListSource, /ikuai/i);
  assert.doesNotMatch(vcenterListSource, /爱快/);
  assert.doesNotMatch(vcenterTypesSource, /ikuai-client-stream|VCenterVMsIkuaiClientStreamResponse/);
  assert.doesNotMatch(ikuaiRouterSource, /未配置 vCenter|vCenter 设置|prometheusUrlVcenter/);
  assert.doesNotMatch(ikuaiRouterSource, /promQueryVcenter|promQueryRangeVcenter/);
  assert.match(ikuaiRouterSource, /promQueryNetwork/);
  assert.match(ikuaiRouterSource, /返回网络设备/);
  assert.match(ikuaiRouterSource, /to="\/cluster\/network\/dashboard"/);
});

test("user-facing navigation keeps vCenter features under compute", () => {
  assert.match(vcenterHubSource, /to="\/cluster\/compute\/vcenter\/vms"/);
  assert.match(vcenterHubSource, /to="\/cluster\/compute\/cloud"/);
  assert.doesNotMatch(vcenterHubSource, /\/cluster\/vcenter\/router/);
  assert.match(globalSearchSource, /href: `\/cluster\/compute\/vcenter\/vms\/\$\{encodeURIComponent\(vm\.moref\)\}`/);
  assert.match(mobileLayoutSource, /to: "\/cluster\/compute\/dashboard"/);

  assert.match(
    computeRoutesSource,
    /<Route index element=\{<Navigate to="dashboard" replace \/>}/
  );
  assert.match(
    computeRoutesSource,
    /path="dashboard"[\s\S]*<RouteSuspense>[\s\S]*<ComputeDashboard \/>/
  );
  assert.match(
    sidebarSource,
    /isDocs \|\| isCompute \|\| isNetwork \|\| isAppcenter \? "概览"/
  );
  assert.match(computeSubNavSource, /to:\s*"\/cluster\/compute\/dashboard"[\s\S]*label:\s*"总览"/);
  assert.match(sidebarSource, /to="\/cluster\/compute\/vcenter\/dashboard"[\s\S]*<span>vCenter<\/span>/);
  assert.doesNotMatch(sidebarSource, />vCenter 总览</);
  assert.doesNotMatch(computeDashboardSource, /兼容策略|\/cluster\/vcenter|旧路径会自动跳转/);

  assert.match(
    computeSubNavSource,
    /to:\s*"\/cluster\/compute\/vcenter\/settings"[\s\S]*label:\s*"vCenter 设置"/
  );
  assert.match(
    computeSubNavSource,
    /to:\s*"\/cluster\/compute\/pve\/targets"[\s\S]*label:\s*"PVE 目标"/
  );
  assert.doesNotMatch(sidebarSource, /to="\/cluster\/compute\/vcenter\/settings"/);
  assert.doesNotMatch(sidebarSource, />vCenter 设置</);
});
