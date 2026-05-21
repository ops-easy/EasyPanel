import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const workspaceSource = read("../src/lib/workspace.ts");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");
const computeRoutesSource = read("../src/app/routes/compute-routes.tsx");
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
  assert.match(headerSource, /moduleVisible\(perm, "compute"\)/);
  assert.match(headerSource, /moduleVisible\(perm, "network"\)/);
  assert.match(sidebarSource, /moduleVisible\(perm, "compute"\)/);
  assert.match(sidebarSource, /moduleVisible\(perm, "network"\)/);
  assert.match(homeHubSource, /menuItemVisible\(perm, "compute"/);
  assert.match(homeHubSource, /menuItemVisible\(perm, "network"/);
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
  assert.match(headerSource, /const headerShowK8s = menuItemVisible\(perm, "kubernetes"/);
  assert.match(headerSource, /\{headerShowK8s \? \(/);
  assert.doesNotMatch(headerSource, /\{moduleVisible\(perm, "k8s"\) \? \(/);
  assert.match(homeHubSource, /enabled: cfg\?\.k8sConfigured === true && showK8s/);
  assert.match(homeHubSource, /enabled: cfg\?\.vcenterConfigured === true && showVc/);
  assert.match(homeHubSource, /enabled: loggedIn && showNetwork/);
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

  const settingsLinks = sidebarSource.match(/to="\/cluster\/compute\/vcenter\/settings"/g) ?? [];
  assert.equal(settingsLinks.length, 1);
});
