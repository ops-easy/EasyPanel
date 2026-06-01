import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const renderScript = read("../../scripts/generate-demo-assets.mjs");
const routeInventory = read("../src/app/route-inventory.ts");

const routeParamSamples = {
  namespace: "easy",
  podName: "easypanel-api-7d98cdd7c8-n4p2z",
  moref: "vm-101",
  targetId: "pve-lab",
  node: "pve-node-1",
  guestType: "qemu",
  vmid: "104",
  hostId: "cloud-vm-1",
  id: "redis-1",
  workloadName: "easypanel-api",
  serviceName: "easypanel-api",
  ingressName: "console-ingress",
  pvcName: "data-easypanel-api",
  configMapName: "easypanel-config",
  secretName: "easypanel-secret",
  crdName: "certificates.cert-manager.io",
  objName: "demo-cert",
  projectName: "library",
  repoPath: "easypanel",
  docId: "1",
  name: "easypanel",
};

const routeSmokePathOverrides = {
  "/cluster/ns/:namespace/pods/:podName/terminal":
    "/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z/terminal?container=api",
  "/cluster/ns/:namespace/statefulsets/:workloadName": "/cluster/ns/easy/statefulsets/redis-master",
  "/cluster/ns/:namespace/daemonsets/:workloadName": "/cluster/ns/easy/daemonsets/node-agent",
  "/cluster/apps/kafka/instance/:id": "/cluster/apps/kafka/instance/1",
  "/cluster/apps/kafka/instance/:id/throttle": "/cluster/apps/kafka/instance/1/throttle",
  "/cluster/apps/cloud-vm/:id": "/cluster/apps/cloud-vm/1",
  "/cluster/apps/openclaw/:id": "/cluster/apps/openclaw/openclaw-1",
  "/cluster/apps/hermes/:id": "/cluster/apps/hermes/hermes-1",
};

function criticalRoutes() {
  return Array.from(routeInventory.matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function toSmokePath(route) {
  if (routeSmokePathOverrides[route]) return routeSmokePathOverrides[route];
  return route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, paramName) => {
    return routeParamSamples[paramName] ?? `${paramName}-demo`;
  });
}

function hasExplicitRouteExpectation(path) {
  const key = `"${path}": {`;
  const start = renderScript.indexOf(key);
  if (start < 0) return false;

  const rest = renderScript.slice(start + key.length);
  const nextRouteKey = rest.search(/\n\s*"\/[^"]+":\s*\{/);
  const end = nextRouteKey >= 0 ? start + key.length + nextRouteKey : renderScript.indexOf("\n};", start);
  const block = renderScript.slice(start, end >= 0 ? end : undefined);
  return /expected(?:Text|FinalPath)\s*:/.test(block);
}

test("render smoke is driven by the critical route inventory", () => {
  assert.match(renderScript, /route-inventory\.ts/);
  assert.match(renderScript, /function\s+readCriticalRoutes\b/);
  assert.match(renderScript, /function\s+toSmokePath\b/);
  assert.match(renderScript, /const\s+renderSmokeRoutes\b/);
  assert.match(renderScript, /selectedRenderSmokeRoutes\(\)/);
  assert.match(renderScript, /for\s*\(\s*const\s+item\s+of\s+routes\s*\)/);
});

test("critical route inventory contains more than the demo screenshot routes", () => {
  const demoRoutes = Array.from(renderScript.matchAll(/\{\s*path:\s*"([^"]+)"/g), (match) => match[1]);

  assert.ok(criticalRoutes().length > demoRoutes.length * 4);
});

test("critical route inventory covers all home workbench entry destinations", () => {
  const routes = criticalRoutes();
  assert.equal(new Set(routes).size, routes.length, "critical routes should not contain duplicates");

  for (const route of [
    "/cluster/settings",
    "/cluster/compute/dashboard",
    "/cluster/compute/config",
    "/cluster/network/dashboard",
    "/cluster/network/config",
    "/cluster/baota",
    "/cluster/baota/settings",
    "/cluster/apps/dashboard",
    "/cluster/bastion",
    "/cluster/bastion/admin",
    "/cluster/ai-inspect/dashboard",
    "/cluster/ai-inspect/configure",
    "/docs",
  ]) {
    assert.ok(routes.includes(route), `missing workbench route ${route}`);
  }
});

test("critical route inventory covers first-level operation pages behind workbench modules", () => {
  const routes = criticalRoutes();
  for (const route of [
    "/cluster/ns",
    "/cluster/nodes",
    "/cluster/etcd",
    "/cluster/rbac",
    "/cluster/custom-resources",
    "/cluster/harbor",
    "/cluster/baota/ingress",
    "/cluster/baota/sync",
    "/cluster/network/access",
    "/cluster/apps/dns/accounts",
    "/cluster/apps/dns/domains",
    "/cluster/apps/dns/records",
    "/cluster/ai-inspect/monitoring",
    "/cluster/ai-inspect/alerts",
    "/cluster/ai-inspect/logs",
    "/cluster/ai-inspect/logs/detail",
    "/cluster/ai-inspect/log-collection",
    "/cluster/ai-inspect/reports",
    "/docs/media",
  ]) {
    assert.ok(routes.includes(route), `missing first-level operation route ${route}`);
  }
});

test("critical route inventory covers high-value management action pages", () => {
  const routes = criticalRoutes();
  for (const route of [
    "/cluster/apps/cloud-vm/create",
    "/cluster/apps/openclaw/create",
    "/cluster/apps/kafka/instance/:id/throttle",
    "/account/personal",
    "/account/site-stats",
    "/cluster/bastion/session",
    "/cluster/bastion/console/:moref",
  ]) {
    assert.ok(routes.includes(route), `missing high-value management route ${route}`);
  }
});

test("critical route inventory covers deep Kubernetes management pages", () => {
  const routes = criticalRoutes();
  for (const route of [
    "/cluster/ns/:namespace",
    "/cluster/ns/:namespace/pods",
    "/cluster/ns/:namespace/deployments",
    "/cluster/ns/:namespace/deployments/:workloadName",
    "/cluster/ns/:namespace/statefulsets",
    "/cluster/ns/:namespace/statefulsets/:workloadName",
    "/cluster/ns/:namespace/daemonsets",
    "/cluster/ns/:namespace/daemonsets/:workloadName",
    "/cluster/ns/:namespace/services",
    "/cluster/ns/:namespace/services/:serviceName",
    "/cluster/ns/:namespace/ingresses",
    "/cluster/ns/:namespace/ingresses/:ingressName",
    "/cluster/ns/:namespace/pvcs",
    "/cluster/ns/:namespace/pvcs/:pvcName/files",
    "/cluster/ns/:namespace/configmaps",
    "/cluster/ns/:namespace/configmaps/:configMapName",
    "/cluster/ns/:namespace/secrets",
    "/cluster/ns/:namespace/secrets/:secretName",
    "/cluster/rbac/sa/:namespace/:name",
    "/cluster/custom-resources/:crdName",
    "/cluster/custom-resources/:crdName/instances/:namespace/:objName",
  ]) {
    assert.ok(routes.includes(route), `missing deep Kubernetes management route ${route}`);
  }
});

test("critical route inventory covers Harbor and document deep management pages", () => {
  const routes = criticalRoutes();
  for (const route of [
    "/cluster/harbor/p/:projectName",
    "/cluster/harbor/p/:projectName/:repoPath",
    "/docs/guides",
    "/docs/guides/doc/:docId",
    "/docs/new",
    "/docs/doc/:docId",
    "/docs/:docId/edit",
  ]) {
    assert.ok(routes.includes(route), `missing Harbor/docs deep route ${route}`);
  }
});

test("critical route inventory covers legacy and redirect management entrypoints", () => {
  const routes = criticalRoutes();
  for (const route of [
    "/cluster/pods",
    "/cluster/pods/:namespace/:podName",
    "/cluster/statefulsets",
    "/cluster/services",
    "/cluster/ingresses",
    "/cluster/pvcs",
    "/cluster/configmaps",
    "/cluster/secrets",
    "/cluster/deployments",
    "/cluster/daemonsets",
    "/cluster/compute",
    "/cluster/compute/vm-settings",
    "/cluster/compute/vcenter",
    "/cluster/compute/vcenter/dashboard",
    "/cluster/compute/vcenter/prometheus",
    "/cluster/compute/bastion",
    "/cluster/compute/pve",
    "/cluster/network",
    "/cluster/network/ikuai",
    "/cluster/network/ikuai/apps",
    "/cluster/network/ikuai/exporter",
    "/cluster/network/openwrt",
    "/cluster/vcenter",
    "/cluster/vcenter/gpu",
    "/cluster/vcenter/hosts",
    "/cluster/vcenter/hosts/:moref",
    "/cluster/vcenter/cloud",
    "/cluster/vcenter/cloud/:hostId/ssh",
    "/cluster/vcenter/bastion",
    "/cluster/vcenter/bastion/session",
    "/cluster/vcenter/bastion/admin",
    "/cluster/vcenter/bastion/console/:moref",
    "/cluster/vcenter/tools/ip-scan",
    "/cluster/vcenter/prometheus",
    "/cluster/vcenter/router",
  ]) {
    assert.ok(routes.includes(route), `missing legacy/redirect management route ${route}`);
  }
});

test("render smoke has explicit expectations for every critical route it exercises", () => {
  const excluded = new Set(["/setup", "/login"]);
  const missing = criticalRoutes()
    .map(toSmokePath)
    .filter((route) => !excluded.has(route))
    .filter((route) => !hasExplicitRouteExpectation(route));

  assert.deepEqual(missing, []);
});

test("render smoke gives terminal routes the required query parameters", () => {
  assert.match(renderScript, /\/cluster\/ns\/:namespace\/pods\/:podName\/terminal/);
  assert.match(renderScript, /container=api/);
  assert.match(renderScript, /\/cluster\/apps\/kafka\/instance\/1/);
  assert.match(renderScript, /\/cluster\/apps\/kafka\/instance\/1\/throttle/);
});

test("render smoke mocks account and Kafka action-page APIs used by high-value routes", () => {
  assert.match(renderScript, /pathname === "\/api\/account\/profile"/);
  assert.match(renderScript, /pathname === "\/api\/audit\/site-stats"/);
  assert.match(renderScript, /pathname === "\/api\/audit\/harbor-dashboard"/);
  assert.ok(renderScript.includes("topics\\/[^/]+\\/throttle"));
});

test("render smoke mocks deep Kubernetes, Harbor, and docs APIs used by management routes", () => {
  for (const apiPath of [
    "/api/k8s/namespace-stats",
    "/api/k8s/deployments",
    "/api/k8s/statefulsets",
    "/api/k8s/daemonsets",
    "/api/k8s/services",
    "/api/k8s/ingresses",
    "/api/k8s/pvcs",
    "/api/k8s/configmaps",
    "/api/k8s/secrets",
    "/api/k8s/object-yaml",
  ]) {
    assert.ok(renderScript.includes(`pathname === "${apiPath}"`), `missing mock for ${apiPath}`);
  }
  assert.ok(renderScript.includes("/api/k8s/pvc-files/easy/data-easypanel-api/mounts"));
  assert.ok(renderScript.includes("rbac\\/service-accounts"));
  assert.ok(renderScript.includes("/api/k8s/crds"));
  assert.ok(renderScript.includes("repositories$/.test(pathname)"));
  assert.ok(renderScript.includes("artifacts$/.test(pathname)"));
  assert.ok(renderScript.includes("dnsRecordListMatch"));
  assert.ok(renderScript.includes("const docDetailMatch = pathname.match"));
});

test("render smoke mocks the bastion home and policy APIs used by workbench routes", () => {
  assert.match(renderScript, /pathname === "\/api\/vcenter\/bastion\/vms"/);
  assert.match(renderScript, /pathname === "\/api\/vcenter\/bastion\/native-ssh"/);
  assert.match(renderScript, /pathname === "\/api\/vcenter\/bastion\/policy"/);
  assert.match(renderScript, /pathname === "\/api\/bastion\/targets\/ssh-settings"/);
});

test("render smoke asserts meaningful page text for workbench setup and operation routes", () => {
  for (const [route, expectedText] of [
    ["/cluster", "集群概览"],
    ["/cluster/ns", "命名空间"],
    ["/cluster/nodes", "节点"],
    ["/cluster/etcd", "etcd"],
    ["/cluster/rbac", "RBAC"],
    ["/cluster/custom-resources", "自定义资源"],
    ["/cluster/harbor", "Harbor 镜像仓库"],
    ["/cluster/compute/dashboard", "虚拟化 Dashboard"],
    ["/cluster/network/dashboard", "网络资源中心"],
    ["/cluster/network/access", "网络配置"],
    ["/cluster/baota", "宝塔工作台"],
    ["/cluster/baota/ingress", "Ingress Rules"],
    ["/cluster/baota/sync", "Baota Sync"],
    ["/cluster/settings", "集群设置"],
    ["/cluster/baota/settings", "宝塔配置向导"],
    ["/cluster/apps/dashboard", "应用中心 · 全局"],
    ["/cluster/apps/dns/accounts", "服务商账号"],
    ["/cluster/apps/dns/domains", "域名管理"],
    ["/cluster/apps/dns/records", "解析记录"],
    ["/cluster/bastion", "堡垒机控制台"],
    ["/cluster/bastion/admin", "堡垒机配置"],
    ["/cluster/ai-inspect/dashboard", "观测与巡检总览"],
    ["/cluster/ai-inspect/configure", "巡检策略"],
    ["/cluster/ai-inspect/monitoring", "监控看板"],
    ["/cluster/ai-inspect/alerts", "告警与通知"],
    ["/cluster/ai-inspect/logs", "VictoriaLogs 状态总览"],
    ["/cluster/ai-inspect/logs/detail", "观测与巡检 · 日志详情"],
    ["/cluster/ai-inspect/log-collection", "虚拟机 / 宝塔 → VictoriaLogs"],
    ["/cluster/ai-inspect/reports", "巡检报告"],
    ["/docs", "文档仓库"],
    ["/docs/media", "媒体与附件"],
  ]) {
    assert.ok(
      renderScript.includes(`"${route}": { expectedText: "${expectedText}" }`),
      `missing render smoke expected text for ${route}`
    );
  }
});

test("render smoke allows explicit standalone tool routes without app shell", () => {
  assert.match(renderScript, /function\s+isStandaloneRenderSmokeRoute\b/);
  assert.ok(renderScript.includes("/\\/cluster\\/ns\\/[^/]+\\/pods\\/[^/]+\\/terminal"));
  assert.ok(renderScript.includes("/\\/cluster\\/bastion\\/session"));
  assert.ok(renderScript.includes("/\\/cluster\\/bastion\\/console\\/[^/?]+"));
  assert.match(renderScript, /acceptsStandaloneShell/);
  assert.match(renderScript, /missing app shell/);
});

test("render smoke verifies redirected legacy routes reach meaningful target pages", () => {
  assert.match(renderScript, /const\s+routeSmokeExpectations\b/);
  assert.match(renderScript, /expectedFinalPath/);
  assert.match(renderScript, /expectedText/);
  assert.match(renderScript, /\/cluster\/vcenter\/dashboard[\s\S]*\/cluster\/compute\/dashboard/);
  assert.match(renderScript, /\/cluster\/network\/config[\s\S]*\/cluster\/network\/access/);
  assert.match(renderScript, /"\/cluster\/pod-restart-reports": \{ expectedFinalPath: "\/cluster\/ai-inspect\/reports\/pod", expectedText: "Pod 级" \}/);
  assert.match(renderScript, /final route .* expected/);
});

test("render smoke treats unmocked API requests as failures instead of proxying to a backend", () => {
  assert.match(renderScript, /unmockedApiRequests/);
  assert.match(renderScript, /unmocked render smoke API/);
  assert.match(renderScript, /render smoke has unmocked API requests/);
  assert.doesNotMatch(renderScript, /response === null\)\s*\{\s*await cdp\.send\("Fetch\.continueRequest"/);
});

test("render smoke keeps API mock coverage strict through page teardown", () => {
  assert.doesNotMatch(renderScript, /pathname\.startsWith\("\/api\/"\)\)\s*return\s*\{\}/);
  assert.doesNotMatch(renderScript, /pathname\.includes\("\/instances"\)\)\s*return\s*\{\s*instances:\s*\[\]\s*\}/);
  assert.doesNotMatch(renderScript, /pathname\.endsWith\("\/devices"\)\)\s*return\s*\{\s*devices:\s*\[\]\s*\}/);
  assert.doesNotMatch(renderScript, /pathname\.endsWith\("\/vms"\)\)\s*return\s*\{\s*vms:\s*\[\]\s*\}/);
  assert.doesNotMatch(renderScript, /pathname\.endsWith\("\/hosts"\)\)\s*return\s*\{\s*hosts:\s*\[\]\s*\}/);
  assert.match(renderScript, /typeof response\.status === "number"/);
  assert.match(renderScript, /const\s+renderSmokePostTaskSettleMs\s*=\s*1200/);
  assert.match(renderScript, /await sleep\(renderSmokePostTaskSettleMs\)[\s\S]*assertNoUnmockedApiRequests/);
  assert.match(renderScript, /Page\.navigate",\s*\{\s*url:\s*"about:blank"/);
});

test("render smoke blocks browser websocket API calls before Vite can proxy them", () => {
  assert.match(renderScript, /Network\.enable/);
  assert.match(renderScript, /Network\.setBlockedURLs/);
  assert.match(renderScript, /Page\.addScriptToEvaluateOnNewDocument/);
  assert.match(renderScript, /MockRenderSmokeWebSocket/);
  assert.match(renderScript, /render-smoke-websocket-blocked/);
  assert.match(renderScript, /ws:\/\/\$\{host\}:\$\{vitePort\}\/api\/\*/);
  assert.match(renderScript, /wss:\/\/\$\{host\}:\$\{vitePort\}\/api\/\*/);
});

test("render smoke supports focused route and viewport filters", () => {
  assert.match(renderScript, /EASYPANEL_RENDER_SMOKE_ROUTE/);
  assert.match(renderScript, /EASYPANEL_RENDER_SMOKE_VIEWPORT/);
  assert.match(renderScript, /filter !== "\/"[\s\S]*item\.path\.includes\(filter\)/);
});

test("render smoke fails explicit route error boundaries instead of relying on text length alone", () => {
  assert.match(renderScript, /hasRouteErrorBoundary/);
  assert.match(renderScript, /页面渲染出错/);
  assert.match(renderScript, /textLength[\s\S]*< 80/);
});
