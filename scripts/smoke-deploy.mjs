#!/usr/bin/env node

import assert from "node:assert/strict";

const base = process.env.SMOKE_BASE_URL;

if (!base) {
  throw new Error("SMOKE_BASE_URL is required, for example: SMOKE_BASE_URL=https://staging.example.com npm run smoke:deploy");
}

const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
const dPath = process.env.SMOKE_D_PATH ?? "/d/";

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

const root = await fetchPath("/", { allowedStatuses: [200] });
const rootHtml = await root.text();
const entryMatch = rootHtml.match(/(?:src|href)="\/assets\/([^"]+\.js)"/);
assert.ok(entryMatch, "GET / must reference a JavaScript asset under /assets/");

await fetchPath("/docs", { allowedStatuses: [200] });
await fetchPath("/api/auth/status", { allowedStatuses: [200, 401, 403] });
await fetchPath(`/assets/${entryMatch[1]}`, { allowedStatuses: [200] });

if (dPath && dPath.toLowerCase() !== "none") {
  await fetchPath(dPath, { rejectServerError: true });
}

console.log(`web deploy smoke ok: base=${baseUrl.origin}, entry=${entryMatch[1]}, dPath=${dPath || "skipped"}`);
