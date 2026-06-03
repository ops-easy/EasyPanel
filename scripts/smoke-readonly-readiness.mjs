#!/usr/bin/env node

import assert from "node:assert/strict";

const focusedReadinessSmokeRoutes = [
  "/login",
  "/",
  "/cluster/compute/dashboard",
  "/cluster/network/dashboard",
  "/cluster/baota",
  "/cluster/ai-inspect/dashboard",
].map((path) => ({ path }));

const requiredReadonlyChecks = [
  "vcenter",
  "pve",
  "openwrt",
  "ikuai",
  "prometheus",
  "victoriaLogs",
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return process.argv[index + 1] ?? "";
}

function splitEnvList(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedReadinessSmokeRoutes() {
  const filters = splitEnvList("EASYPANEL_RENDER_SMOKE_ROUTE");
  if (filters.length === 0) return focusedReadinessSmokeRoutes;
  return focusedReadinessSmokeRoutes.filter((item) =>
    filters.some((filter) => item.path === filter || (filter !== "/" && item.path.includes(filter)))
  );
}

function selectedReadonlyChecks() {
  const filters = splitEnvList("SMOKE_READINESS_CHECKS");
  if (filters.length === 0) return requiredReadonlyChecks;

  const known = new Set(requiredReadonlyChecks);
  const unknown = filters.filter((key) => !known.has(key));
  assert.deepEqual(unknown, [], `unknown SMOKE_READINESS_CHECKS entries: ${unknown.join(", ")}`);
  return filters;
}

const base = argValue("--base-url") || process.env.SMOKE_BASE_URL;
if (!base) {
  throw new Error(
    "SMOKE_BASE_URL is required, for example: SMOKE_BASE_URL=https://staging.example.com npm run smoke:readonly-readiness"
  );
}

const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
const requestTimeoutMs = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 15000);
const smokeRoutes = selectedReadinessSmokeRoutes();
const readonlyChecks = selectedReadonlyChecks();

assert.ok(
  smokeRoutes.length > 0,
  `no readonly readiness smoke routes selected by EASYPANEL_RENDER_SMOKE_ROUTE=${process.env.EASYPANEL_RENDER_SMOKE_ROUTE}`
);

function urlFor(pathname) {
  return new URL(pathname.replace(/^\//, ""), baseUrl);
}

function authHeaders() {
  const headers = {};
  const cookie = process.env.SMOKE_AUTH_COOKIE;
  const bearer = process.env.SMOKE_BEARER_TOKEN;
  if (cookie) headers.Cookie = cookie;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  return headers;
}

async function fetchPath(pathname, { allowedStatuses, headers = {}, rejectServerError = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const res = await fetch(urlFor(pathname), {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    if (rejectServerError && res.status >= 500) {
      throw new Error(`${pathname} returned ${res.status}`);
    }

    if (allowedStatuses) {
      assert.ok(
        allowedStatuses.includes(res.status),
        `${pathname} returned ${res.status}, expected one of ${allowedStatuses.join(", ")}`
      );
    }

    return res;
  } finally {
    clearTimeout(timer);
  }
}

function parseDistAssets(html) {
  return Array.from(html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g), (match) => match[1]);
}

function assertSpaIndex(pathname, html, entryAsset) {
  assert.match(html, /<div id="root"><\/div>/, `${pathname} should return SPA index.html`);
  assert.ok(html.includes(`/assets/${entryAsset}`), `${pathname} should reference entry asset ${entryAsset}`);
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function assertReadonlyProbe(label, item) {
  assert.ok(item && typeof item === "object", `${label} readiness check is missing`);
  assert.equal(normalizeStatus(item.status), "readonly_reachable", `${label} should be readonly_reachable`);
  assert.ok(item.configured === true, `${label} should report configured=true`);
  assert.ok(item.reachable === true, `${label} should report reachable=true`);
  assert.ok(item.readonly === true, `${label} should report readonly=true`);
}

function assertSystemCheckReadiness(label, payload) {
  const systemCheck = payload?.systemCheck;
  assert.ok(systemCheck && typeof systemCheck === "object", `${label} should include systemCheck`);
  assert.ok(systemCheck.checks && typeof systemCheck.checks === "object", `${label} should include systemCheck.checks`);

  for (const key of readonlyChecks) {
    assertReadonlyProbe(`${label} ${key}`, systemCheck.checks[key]);
  }

  if (systemCheck.baota) {
    assert.notEqual(normalizeStatus(systemCheck.baota.status), "error", `${label} baota should not report error`);
  }
}

const root = await fetchPath("/", { allowedStatuses: [200] });
const rootHtml = await root.text();
const assets = [...new Set(parseDistAssets(rootHtml))];
const entryAsset = assets.find((asset) => asset.endsWith(".js"));
assert.ok(entryAsset, "GET / must reference a JavaScript asset under /assets/");
assertSpaIndex("/", rootHtml, entryAsset);

for (const item of smokeRoutes) {
  if (item.path === "/") continue;
  const res = await fetchPath(item.path, { allowedStatuses: [200] });
  assertSpaIndex(item.path, await res.text(), entryAsset);
}

for (const asset of assets) {
  await fetchPath(`/assets/${asset}`, { allowedStatuses: [200] });
}

const publicStatus = await fetchPath("/api/login/public-status", { allowedStatuses: [200] });
assertSystemCheckReadiness("/api/login/public-status", await publicStatus.json());

const headers = authHeaders();
const hasAuthHeaders = Object.keys(headers).length > 0;
const runtimeStatus = await fetchPath("/api/runtime/status", {
  allowedStatuses: hasAuthHeaders ? [200] : [200, 401, 403],
  headers,
});

if (runtimeStatus.status === 200) {
  assertSystemCheckReadiness("/api/runtime/status", await runtimeStatus.json());
} else {
  console.warn(
    `authenticated runtime readiness skipped: /api/runtime/status returned ${runtimeStatus.status}; set SMOKE_AUTH_COOKIE or SMOKE_BEARER_TOKEN to verify it too`
  );
}

console.log(
  `readonly readiness smoke ok: base=${baseUrl.origin}, routes=${smokeRoutes.length}, assets=${assets.length}, checks=${readonlyChecks.join(",")}`
);
