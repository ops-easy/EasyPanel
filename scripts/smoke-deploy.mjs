#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const routeInventoryPath = path.join(repoRoot, "frontend", "src", "app", "route-inventory.ts");

const productionSafeSmokeRouteExact = [
  "/",
  "/settings",
];
const productionSafeSmokeRoutePrefixes = [
  "/cluster/compute",
  "/cluster/network",
  "/cluster/apps",
  "/account",
  "/docs",
];
const productionSafeParameterizedSmokeRoutes = [
  "/docs/guides/doc/:docId",
  "/docs/doc/:docId",
  "/docs/:docId/edit",
];

const routeParamSamples = {
  docId: "1",
};

const unauthenticatedProbePaths = [
  "/api/setup/status",
  "/api/auth/status",
  "/api/login/public-status",
];

const requiredDeploySmokeRoutes = [
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
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return process.argv[index + 1] ?? "";
}

function argFlag(name) {
  return process.argv.includes(name);
}

function envFlag(name) {
  return ["1", "true", "yes", "on"].includes(String(process.env[name] ?? "").trim().toLowerCase());
}

function readCriticalRoutes() {
  const source = readFileSync(routeInventoryPath, "utf8");
  const block = source.match(/export const criticalRoutes = \[([\s\S]*?)\] as const;/);
  assert.ok(block, "frontend/src/app/route-inventory.ts must export criticalRoutes as const");
  return Array.from(block[1].matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function isProductionSafeSmokeRoute(route) {
  if (productionSafeParameterizedSmokeRoutes.includes(route)) return true;
  if (route.includes(":")) return false;
  if (productionSafeSmokeRouteExact.includes(route)) return true;
  return productionSafeSmokeRoutePrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
}

function selectedDeploySmokeRoutes(criticalRoutes) {
  const routes = criticalRoutes.filter(isProductionSafeSmokeRoute);
  const routeSet = new Set(routes);
  const missing = requiredDeploySmokeRoutes.filter((route) => !routeSet.has(route));
  assert.deepEqual(missing, [], `deploy smoke route policy missed required critical routes: ${missing.join(", ")}`);
  return routes.map(toSmokePath);
}

function toSmokePath(route) {
  return route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, paramName) => {
    return routeParamSamples[paramName] ?? `${paramName}-smoke`;
  });
}

const base = argValue("--base-url") || process.env.SMOKE_BASE_URL;

if (!base) {
  throw new Error("SMOKE_BASE_URL is required, for example: SMOKE_BASE_URL=https://staging.example.com npm run smoke:deploy");
}

const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
const backendPassthroughProbePaths = [
  process.env.SMOKE_R_PATH ?? "/r/",
  process.env.SMOKE_D_PATH ?? "/d/",
].filter((probePath) => probePath && probePath.toLowerCase() !== "none");
const spaSmokeRoutes = selectedDeploySmokeRoutes(readCriticalRoutes());

function urlFor(pathname) {
  return new URL(pathname.replace(/^\//, ""), baseUrl);
}

async function fetchPath(pathname, { allowedStatuses, rejectServerError = true } = {}) {
  const res = await fetch(urlFor(pathname), { redirect: "manual" });

  if (rejectServerError && res.status >= 500) {
    throw new Error(`${pathname} returned ${res.status}`);
  }

  if (allowedStatuses) {
    assert.ok(
      allowedStatuses.includes(res.status),
      `${pathname} returned ${res.status}, expected one of ${allowedStatuses.join(", ")}`,
    );
  }

  return res;
}

function parseDistAssets(html) {
  return Array.from(html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g), (match) => match[1]);
}

function assertSpaIndex(pathname, html, entryAsset) {
  assert.match(html, /<div id="root"><\/div>/, `${pathname} should return SPA index.html`);
  assert.ok(html.includes(`/assets/${entryAsset}`), `${pathname} should reference entry asset ${entryAsset}`);
}

const root = await fetchPath("/", { allowedStatuses: [200] });
const rootHtml = await root.text();
const assets = [...new Set(parseDistAssets(rootHtml))];
const entryAsset = assets.find((asset) => asset.endsWith(".js"));
assert.ok(entryAsset, "GET / must reference a JavaScript asset under /assets/");
assertSpaIndex("/", rootHtml, entryAsset);

for (const route of spaSmokeRoutes) {
  if (route === "/") continue;
  const res = await fetchPath(route, { allowedStatuses: [200] });
  assertSpaIndex(route, await res.text(), entryAsset);
}

for (const probePath of unauthenticatedProbePaths) {
  await fetchPath(probePath, { allowedStatuses: [200, 401, 403] });
}

for (const asset of assets) {
  await fetchPath(`/assets/${asset}`, { allowedStatuses: [200] });
}

for (const probePath of backendPassthroughProbePaths) {
  await fetchPath(probePath, { rejectServerError: true });
}

console.log(
  `frontend deploy smoke ok: base=${baseUrl.origin}, spaRoutes=${spaSmokeRoutes.length}, assets=${assets.length}, unauth=${unauthenticatedProbePaths.length}, passthrough=${backendPassthroughProbePaths.length}`,
);

if (argFlag("--readonly-readiness") || envFlag("SMOKE_READONLY_READINESS")) {
  process.env.SMOKE_BASE_URL = base;
  await import("./smoke-readonly-readiness.mjs");
}
