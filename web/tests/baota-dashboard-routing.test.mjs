import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const appSource = read("../src/App.tsx");
const clusterRoutesSource = read("../src/app/routes/cluster-routes.tsx");
const headerSource = read("../src/shared/layout/Header.tsx");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");
const baotaSyncSource = read("../src/features/baota/pages/BaotaSync.tsx");
const baotaDashboardUrl = new URL("../src/features/baota/pages/BaotaDashboard.tsx", import.meta.url);
const baotaDashboardSource = existsSync(baotaDashboardUrl) ? read("../src/features/baota/pages/BaotaDashboard.tsx") : "";

function sourceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing section start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing section end: ${endNeedle}`);
  return source.slice(start, end);
}

test("baota workspace opens the module dashboard instead of ingress sync", () => {
  assert.doesNotMatch(appSource, /path="baota" element=\{<Navigate to="\/cluster\/baota\/sync"/);
  assert.match(appSource, /path="baota" element=\{<Navigate to="\/cluster\/baota"/);

  assert.match(clusterRoutesSource, /import BaotaDashboard/);
  assert.match(clusterRoutesSource, /<Route index element=\{<BaotaDashboard \/>}/);
  assert.doesNotMatch(clusterRoutesSource, /<Route index element=\{<Navigate to="sync" replace \/>}/);

  const headerBaotaItem = sourceBetween(headerSource, "{headerShowBaota ? (", "{headerShowApp ? (");
  assert.match(headerBaotaItem, /navigate\("\/cluster\/baota"\)/);
  assert.doesNotMatch(headerBaotaItem, /\/cluster\/baota\/sync/);

  const hubBaotaItem = sourceBetween(sidebarSource, "{showBaotaNav && (", "{showAppCenterNav && (");
  assert.match(hubBaotaItem, /to="\/cluster\/baota"/);
  assert.doesNotMatch(hubBaotaItem, /\/cluster\/baota\/sync/);

  assert.ok(baotaDashboardSource.length > 0, "BaotaDashboard.tsx should exist");
  assert.match(baotaDashboardSource, /宝塔工作台|宝塔概览/);
  assert.doesNotMatch(baotaDashboardSource, /\/api\/status|sync-routes/);
});

test("baota ingress sync scopes k8s connectivity errors to the ingress section", () => {
  assert.doesNotMatch(baotaSyncSource, /const err = rtQ\.error \|\| routesQ\.error/);
  assert.match(baotaSyncSource, /const runtimeError = rtQ\.error/);
  assert.match(baotaSyncSource, /const routesError = routesQ\.error/);
  assert.match(baotaSyncSource, /Ingress 路由依赖 Kubernetes/);
  assert.doesNotMatch(baotaSyncSource, /check\?\.k8s\.nodeIP|Node:/);
});
