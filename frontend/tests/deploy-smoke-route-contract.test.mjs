import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const smokeDeploy = read("../../scripts/smoke-deploy.mjs");
const routeInventory = read("../src/app/route-inventory.ts");

function criticalRoutes() {
  const block = routeInventory.match(/export const criticalRoutes = \[([\s\S]*?)\] as const;/);
  assert.ok(block, "route-inventory.ts should export criticalRoutes as const");
  return Array.from(block[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function stringArrayLiteral(source, name) {
  const block = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  assert.ok(block, `scripts/smoke-deploy.mjs should define ${name}`);
  return Array.from(block[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function deploySmokePolicyRoutes() {
  const routes = criticalRoutes();
  const exact = stringArrayLiteral(smokeDeploy, "productionSafeSmokeRouteExact");
  const prefixes = stringArrayLiteral(smokeDeploy, "productionSafeSmokeRoutePrefixes");
  const parameterized = stringArrayLiteral(smokeDeploy, "productionSafeParameterizedSmokeRoutes");

  return routes.filter((route) => {
    if (parameterized.includes(route)) return true;
    if (route.includes(":")) return false;
    return exact.includes(route) || prefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  });
}

test("remote deploy smoke derives its SPA fallback subset from criticalRoutes", () => {
  assert.match(smokeDeploy, /route-inventory\.ts/);
  assert.match(smokeDeploy, /function\s+readCriticalRoutes\b/);
  assert.match(smokeDeploy, /function\s+selectedDeploySmokeRoutes\b/);
  assert.match(smokeDeploy, /criticalRoutes\.filter\(/);
  assert.doesNotMatch(smokeDeploy, /const\s+spaSmokeRoutes\s*=\s*\[\s*["'`]/);
});

test("remote deploy smoke policy covers production-safe critical entrypoints", () => {
  const routes = criticalRoutes();
  const smokeRoutes = deploySmokePolicyRoutes();
  assert.equal(new Set(routes).size, routes.length, "criticalRoutes should not contain duplicates");

  for (const route of [
    "/",
    "/settings",
    "/cluster/compute/dashboard",
    "/cluster/compute/config",
    "/cluster/compute/pve/dashboard",
    "/cluster/compute/pve/targets",
    "/cluster/network/dashboard",
    "/cluster/network/access",
    "/cluster/network/ikuai/dashboard",
    "/cluster/network/openwrt/dashboard",
    "/cluster/apps/dashboard",
    "/cluster/apps/redis",
    "/cluster/apps/mysql",
    "/cluster/apps/kafka",
    "/cluster/apps/dns",
    "/cluster/apps/dns/accounts",
    "/cluster/apps/cloud-vm",
    "/account/personal",
    "/account/settings",
    "/account/users",
    "/account/audit",
    "/account/site-stats",
    "/docs",
    "/docs/media",
    "/docs/guides",
    "/docs/new",
    "/docs/doc/:docId",
    "/docs/:docId/edit",
  ]) {
    assert.ok(routes.includes(route), `criticalRoutes missing ${route}`);
    assert.ok(smokeRoutes.includes(route), `deploy smoke policy does not select ${route}`);
  }
});

test("remote deploy smoke limits remote checks to deployment-safe surfaces", () => {
  assert.match(smokeDeploy, /function\s+toSmokePath\b/);
  assert.match(smokeDeploy, /function\s+assertSpaIndex\b/);
  assert.match(smokeDeploy, /<div id="root"><\\\/div>/);
  assert.match(smokeDeploy, /unauthenticatedProbePaths/);
  assert.ok(smokeDeploy.includes("/api/setup/status"));
  assert.ok(smokeDeploy.includes("/api/auth/status"));
  assert.ok(smokeDeploy.includes("/api/login/public-status"));
  assert.match(smokeDeploy, /allowedStatuses:\s*\[200,\s*401,\s*403\]/);
  assert.match(smokeDeploy, /for\s*\(\s*const\s+asset\s+of\s+assets\s*\)/);
  assert.match(smokeDeploy, /redirect:\s*"manual"/);
});
