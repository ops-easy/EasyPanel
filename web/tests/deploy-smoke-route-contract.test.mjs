import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const smokeDeploy = read("../../scripts/smoke-deploy.mjs");
const checkDeploy = read("../../scripts/check-web-deploy-smoke.mjs");

const takeoverRoutes = [
  "/cluster/compute/pve/dashboard",
  "/cluster/compute/pve/targets",
  "/cluster/network/openwrt/dashboard",
];

function escapedRoute(route) {
  return route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("deploy smoke scripts cover PVE and OpenWrt takeover entry routes", () => {
  for (const route of takeoverRoutes) {
    const routeLiteral = new RegExp(`["'\`]${escapedRoute(route)}["'\`]`);
    assert.match(smokeDeploy, routeLiteral, `scripts/smoke-deploy.mjs missing ${route}`);
    assert.match(checkDeploy, routeLiteral, `scripts/check-web-deploy-smoke.mjs missing ${route}`);
  }
});

test("remote deploy smoke validates takeover routes return the SPA shell", () => {
  assert.match(smokeDeploy, /function\s+assertSpaIndex\b/);
  assert.match(smokeDeploy, /<div id="root"><\\\/div>/);
  assert.match(smokeDeploy, /entryAsset/);
  assert.match(smokeDeploy, /for\s*\(\s*const\s+route\s+of\s+spaSmokeRoutes\s*\)/);
});
