import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const packageJson = JSON.parse(read("../package.json"));
const repoRoot = new URL("../../", import.meta.url);
const smokeScriptUrl = new URL("scripts/smoke-readonly-readiness.mjs", repoRoot);

test("readonly readiness smoke has a single npm preset", () => {
  assert.equal(
    packageJson.scripts["smoke:readonly-readiness"],
    "node ../scripts/smoke-readonly-readiness.mjs"
  );
});

test("readonly readiness smoke keeps the focused connected-environment route set", () => {
  assert.ok(existsSync(smokeScriptUrl), "scripts/smoke-readonly-readiness.mjs should exist");
  const source = read("../../scripts/smoke-readonly-readiness.mjs");

  for (const route of [
    "/login",
    "/",
    "/cluster/compute/dashboard",
    "/cluster/network/dashboard",
    "/cluster/baota",
    "/cluster/ai-inspect/dashboard",
  ]) {
    assert.ok(source.includes(`"${route}"`), `missing focused smoke route ${route}`);
  }

  assert.match(source, /EASYPANEL_RENDER_SMOKE_ROUTE/);
  assert.match(source, /item\.path === filter/);
  assert.match(source, /filter !== "\/"[\s\S]*item\.path\.includes\(filter\)/);
});

test("readonly readiness smoke verifies only readonly probe expectations", () => {
  const source = read("../../scripts/smoke-readonly-readiness.mjs");

  assert.doesNotMatch(source, /method:\s*["']POST["']/);
  assert.doesNotMatch(source, /method:\s*["']PUT["']/);
  assert.doesNotMatch(source, /method:\s*["']PATCH["']/);
  assert.doesNotMatch(source, /method:\s*["']DELETE["']/);
  assert.ok(source.includes("/api/login/public-status"));
  assert.ok(source.includes("/api/runtime/status"));

  for (const key of ["vcenter", "pve", "openwrt", "ikuai", "prometheus", "victoriaLogs"]) {
    assert.ok(source.includes(`"${key}"`), `missing readonly probe check ${key}`);
  }

  assert.match(source, /readonly_reachable/);
  assert.match(source, /configured\s*===\s*true/);
  assert.match(source, /reachable\s*===\s*true/);
  assert.match(source, /readonly\s*===\s*true/);
});

test("readonly readiness smoke command is documented with the verification notes", () => {
  const readme = read("../../README.md");

  assert.ok(readme.includes("smoke:readonly-readiness"));
  assert.ok(readme.includes("SMOKE_BASE_URL=https://your-staging.example.com npm run smoke:readonly-readiness"));
  assert.ok(readme.includes("SMOKE_AUTH_COOKIE"));
  assert.ok(readme.includes("SMOKE_BEARER_TOKEN"));
  assert.ok(readme.includes("SMOKE_READINESS_CHECKS"));
  assert.ok(readme.includes("/cluster/ai-inspect/dashboard"));
});
