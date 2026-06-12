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

test("deploy smoke can opt into readonly readiness without local check", () => {
  assert.equal(
    packageJson.scripts["smoke:deploy:readiness"],
    "node ../scripts/smoke-deploy.mjs --readonly-readiness"
  );
  assert.equal(packageJson.scripts["smoke:deploy"], "node ../scripts/smoke-deploy.mjs");
  assert.doesNotMatch(packageJson.scripts.check, /readonly-readiness|smoke:deploy:readiness|SMOKE_READONLY_READINESS/);

  const deploySmoke = read("../../scripts/smoke-deploy.mjs");
  assert.match(deploySmoke, /SMOKE_READONLY_READINESS/);
  assert.match(deploySmoke, /--readonly-readiness/);
  assert.match(deploySmoke, /import\("\.\/smoke-readonly-readiness\.mjs"\)/);
});

test("deploy smoke forwards CLI base-url to readonly readiness child", () => {
  const deploySmoke = read("../../scripts/smoke-deploy.mjs");

  assert.match(deploySmoke, /const\s+base\s*=\s*argValue\("--base-url"\)\s*\|\|\s*process\.env\.SMOKE_BASE_URL/);
  assert.match(deploySmoke, /process\.env\.SMOKE_BASE_URL\s*=\s*base/);
  assert.match(
    deploySmoke,
    /process\.env\.SMOKE_BASE_URL\s*=\s*base[\s\S]*await\s+import\("\.\/smoke-readonly-readiness\.mjs"\)/
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
  assert.ok(readme.includes("npm run smoke:deploy:readiness -- --base-url https://your-staging.example.com"));
  assert.ok(readme.includes("SMOKE_AUTH_COOKIE"));
  assert.ok(readme.includes("SMOKE_BEARER_TOKEN"));
  assert.ok(readme.includes("SMOKE_READINESS_CHECKS"));
  assert.ok(readme.includes("/cluster/ai-inspect/dashboard"));
});

test("frontend remote smoke workflow runs the readiness preset with optional auth secrets", () => {
  const workflow = read("../../.github/workflows/frontend-remote-smoke.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /base-url:/);
  assert.match(workflow, /timeout-minutes:\s*15/);
  assert.match(workflow, /REMOTE_SMOKE_BASE_URL:\s*\$\{\{\s*inputs\.base-url\s*\}\}/);
  assert.match(workflow, /SMOKE_AUTH_COOKIE:\s*\$\{\{\s*secrets\.SMOKE_AUTH_COOKIE\s*\}\}/);
  assert.match(workflow, /SMOKE_BEARER_TOKEN:\s*\$\{\{\s*secrets\.SMOKE_BEARER_TOKEN\s*\}\}/);
  assert.match(workflow, /working-directory:\s*\.\/frontend/);
  assert.match(workflow, /run:\s*npm ci/);
  assert.match(workflow, /run:\s*npm run smoke:deploy:readiness -- --base-url "\$REMOTE_SMOKE_BASE_URL"/);
  assert.doesNotMatch(workflow, /npm run smoke:deploy(?!:readiness)/);
});

test("remote readiness smoke workflow is documented consistently", () => {
  const workflow = read("../../.github/workflows/frontend-remote-smoke.yml");
  const docs = [
    ["README.md", read("../../README.md")],
    ["k8s/README.md", read("../../k8s/README.md")],
  ];

  for (const [label, source] of docs) {
    assert.ok(source.includes(".github/workflows/frontend-remote-smoke.yml"), `${label} should reference the workflow`);
    assert.ok(source.includes("base-url"), `${label} should document the workflow input`);
    assert.ok(source.includes("SMOKE_AUTH_COOKIE"), `${label} should document cookie auth secret`);
    assert.ok(source.includes("SMOKE_BEARER_TOKEN"), `${label} should document bearer auth secret`);
    assert.ok(source.includes("smoke:deploy:readiness"), `${label} should reference the readiness npm preset`);
  }

  assert.match(workflow, /npm run smoke:deploy:readiness/);
});
