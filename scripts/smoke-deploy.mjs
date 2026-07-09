#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  completeSmokeSummary,
  createSmokeSummary,
  emitSmokeSummary,
  errorMessage,
  recordFailedItem,
  recordSmokeRoute,
} from "./smoke-summary.mjs";

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

function setEnvFromArg(envName, argName) {
  const value = argValue(argName);
  if (value) process.env[envName] = value;
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
const summary = createSmokeSummary("smoke-deploy", baseUrl);
const backendPassthroughProbePaths = [
  process.env.SMOKE_R_PATH ?? "/r/",
  process.env.SMOKE_D_PATH ?? "/d/",
].filter((probePath) => probePath && probePath.toLowerCase() !== "none");
const spaSmokeRoutes = selectedDeploySmokeRoutes(readCriticalRoutes());

function urlFor(pathname) {
  return new URL(pathname.replace(/^\//, ""), baseUrl);
}

function statusError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function fetchPath(pathname, { allowedStatuses, rejectServerError = true } = {}) {
  const res = await fetch(urlFor(pathname), { redirect: "manual" });

  if (rejectServerError && res.status >= 500) {
    throw statusError(`${pathname} returned ${res.status}`, res.status);
  }

  if (allowedStatuses && !allowedStatuses.includes(res.status)) {
    throw statusError(`${pathname} returned ${res.status}, expected one of ${allowedStatuses.join(", ")}`, res.status);
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

async function checkSmokeRoute(route, entryAsset) {
  try {
    const res = await fetchPath(route, { allowedStatuses: [200] });
    recordSmokeRoute(summary, { path: route, statusCode: res.status });
    assertSpaIndex(route, await res.text(), entryAsset);
  } catch (error) {
    recordSmokeRoute(summary, {
      path: route,
      statusCode: error.statusCode ?? null,
      ok: false,
      message: errorMessage(error),
    });
    throw error;
  }
}

async function checkProbePath(probePath, options) {
  try {
    const res = await fetchPath(probePath, options);
    recordSmokeRoute(summary, { kind: "probe", path: probePath, statusCode: res.status });
  } catch (error) {
    recordSmokeRoute(summary, {
      kind: "probe",
      path: probePath,
      statusCode: error.statusCode ?? null,
      ok: false,
      message: errorMessage(error),
    });
    throw error;
  }
}

async function main() {
  const root = await fetchPath("/", { allowedStatuses: [200] });
  recordSmokeRoute(summary, { path: "/", statusCode: root.status });
  const rootHtml = await root.text();
  const assets = [...new Set(parseDistAssets(rootHtml))];
  const entryAsset = assets.find((asset) => asset.endsWith(".js"));
  assert.ok(entryAsset, "GET / must reference a JavaScript asset under /assets/");
  assertSpaIndex("/", rootHtml, entryAsset);

  for (const route of spaSmokeRoutes) {
    if (route === "/") continue;
    await checkSmokeRoute(route, entryAsset);
  }

  for (const probePath of unauthenticatedProbePaths) {
    await checkProbePath(probePath, { allowedStatuses: [200, 401, 403] });
  }

  for (const asset of assets) {
    await checkProbePath(`/assets/${asset}`, { allowedStatuses: [200] });
  }

  for (const probePath of backendPassthroughProbePaths) {
    await checkProbePath(probePath, { rejectServerError: true });
  }

  completeSmokeSummary(summary, "passed");
  emitSmokeSummary(summary, { fileName: "smoke-deploy-summary.json" });
  console.log(
    `frontend deploy smoke ok: base=${baseUrl.origin}, spaRoutes=${spaSmokeRoutes.length}, assets=${assets.length}, unauth=${unauthenticatedProbePaths.length}, passthrough=${backendPassthroughProbePaths.length}`,
  );

  if (argFlag("--readonly-readiness") || envFlag("SMOKE_READONLY_READINESS")) {
    process.env.SMOKE_BASE_URL = base;
    setEnvFromArg("SMOKE_READINESS_CHECKS", "--readiness-checks");
    setEnvFromArg("EASYPANEL_RENDER_SMOKE_ROUTE", "--render-routes");
    setEnvFromArg("SMOKE_REQUEST_TIMEOUT_MS", "--request-timeout-ms");
    await import("./smoke-readonly-readiness.mjs");
  }
}

main().catch((error) => {
  if (summary.failedItems.length === 0) {
    recordFailedItem(summary, { kind: "script", message: errorMessage(error) });
  }
  completeSmokeSummary(summary, "failed");
  emitSmokeSummary(summary, { fileName: "smoke-deploy-summary.json" });
  console.error(errorMessage(error));
  process.exitCode = 1;
});
