import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(frontendRoot, "..");

function readJSON(rel) {
  return JSON.parse(readFileSync(join(repoRoot, rel), "utf8"));
}

function routeSegments(pathPattern) {
  return pathPattern.replace(/\/+$/, "").split("/").filter(Boolean);
}

function segmentMatches(frontend, backend) {
  if (frontend.startsWith(":")) return true;
  if (backend.startsWith(":")) return true;
  if (backend.startsWith("*")) return true;
  return frontend === backend;
}

function patternMatches(frontendPath, backendPath) {
  const frontend = routeSegments(frontendPath);
  const backend = routeSegments(backendPath);
  for (let i = 0; i < backend.length; i += 1) {
    const backendSegment = backend[i];
    if (backendSegment.startsWith("*")) return true;
    if (i >= frontend.length) return false;
    if (!segmentMatches(frontend[i], backendSegment)) return false;
  }
  return frontend.length === backend.length;
}

test("frontend static API paths are covered by backend routes", () => {
  const backend = readJSON("docs/api-contract/backend-routes.json").routes;
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const misses = [];

  for (const use of frontend) {
    if (use.kind === "literal") continue;
    if (use.needsManualReview) continue;
    const candidates = backend.filter((route) => route.method === "ANY" || use.method === "UNKNOWN" || route.method === use.method);
    if (!candidates.some((route) => patternMatches(use.pathPattern, route.pathPattern))) {
      misses.push(`${use.method} ${use.pathPattern} at ${use.sourceFile}:${use.sourceLine}`);
    }
  }

  assert.deepEqual(misses, [], `frontend API paths without backend coverage:\n${misses.join("\n")}`);
});

test("frontend HTTP API paths, including dynamic params, are covered by backend routes", () => {
  const backend = readJSON("docs/api-contract/backend-routes.json").routes;
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const misses = [];

  for (const use of frontend) {
    if (use.kind !== "http" && use.kind !== "websocket") continue;
    const candidates = backend.filter((route) => route.method === "ANY" || use.method === "UNKNOWN" || route.method === use.method || (use.kind === "websocket" && route.method === "GET"));
    if (!candidates.some((route) => patternMatches(use.pathPattern, route.pathPattern))) {
      misses.push(`${use.method} ${use.pathPattern} at ${use.sourceFile}:${use.sourceLine}`);
    }
  }

  assert.deepEqual(misses, [], `frontend HTTP API paths without backend coverage:\n${misses.join("\n")}`);
});

test("frontend runtime API paths have concrete methods", () => {
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const unknownRuntime = frontend
    .filter((use) => use.kind !== "literal" && use.method === "UNKNOWN")
    .map((use) => `${use.kind} ${use.pathPattern} at ${use.sourceFile}:${use.sourceLine}`);

  assert.deepEqual(unknownRuntime, [], `frontend runtime API paths without method inference:\n${unknownRuntime.join("\n")}`);
});

test("frontend dynamic API paths stay visible for manual review", () => {
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const dynamicUses = frontend.filter((use) => use.needsManualReview);
  assert.ok(dynamicUses.length > 0, "expected dynamic API paths to be listed for manual review");
  for (const use of dynamicUses) {
    assert.match(use.pathPattern, /^\/(?:api|r|d)(?:\/|$)/);
    assert.ok(use.sourceFile && use.sourceLine > 0);
  }
});

test("frontend template literal API paths are normalized to route params", () => {
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const malformed = frontend
    .filter((use) => use.pathPattern.includes("${") || use.pathPattern.includes("encodeURIComponent("))
    .map((use) => `${use.method} ${use.pathPattern} at ${use.sourceFile}:${use.sourceLine}`);

  assert.deepEqual(malformed, [], `frontend API manifest contains malformed template paths:\n${malformed.join("\n")}`);
});

test("frontend template literal API paths keep static suffixes after params", () => {
  const frontend = readJSON("docs/api-contract/frontend-api-uses.json").routes;
  const routeKeys = new Set(frontend.map((use) => `${use.method} ${use.pathPattern}`));

  for (const key of [
    "POST /api/app-center/hermes/instances/:param/probe",
    "PUT /api/app-center/hermes/instances/:param/exposure",
    "POST /api/app-center/hermes/instances/:param/upgrade",
    "POST /api/app-center/hermes/instances/:param/rollback",
  ]) {
    assert.ok(routeKeys.has(key), `missing normalized template literal route ${key}`);
  }
});
