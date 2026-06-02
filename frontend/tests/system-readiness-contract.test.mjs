import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const homeHubSource = readFileSync(new URL("../src/pages/HomeHub.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../src/pages/Login.tsx", import.meta.url), "utf8");

test("frontend SystemCheck type exposes unified readonly probe checks", () => {
  assert.match(apiSource, /export type SystemCheckStatus =/);
  for (const status of [
    "not_configured",
    "configured_unreachable",
    "readonly_reachable",
    "datasource_error",
    "hidden",
  ]) {
    assert.match(apiSource, new RegExp(`"${status}"`));
  }
  assert.match(apiSource, /export type SystemCheckItem = \{/);
  assert.match(apiSource, /checks\?: \{/);
  for (const key of ["vcenter", "pve", "openwrt", "ikuai", "prometheus", "victoriaLogs"]) {
    assert.match(apiSource, new RegExp(`${key}\\?: SystemCheckItem`));
  }
});

test("workbench status cards consume unified readonly probe checks", () => {
  assert.match(homeHubSource, /function readinessMetric/);
  assert.match(homeHubSource, /function readinessHasProblem/);
  for (const binding of [
    "vcenterReadiness",
    "pveReadiness",
    "openWrtReadiness",
    "ikuaiReadiness",
    "prometheusReadiness",
    "victoriaLogsReadiness",
  ]) {
    assert.match(homeHubSource, new RegExp(`const ${binding} = check\\?\\.checks\\?\\.`));
  }
  assert.match(homeHubSource, /readinessHasProblem\(vcenterReadiness\)/);
  assert.match(homeHubSource, /readinessHasProblem\(pveReadiness\)/);
  assert.match(homeHubSource, /readinessMetric\(openWrtReadiness/);
  assert.match(homeHubSource, /readinessMetric\(ikuaiReadiness/);
  assert.match(homeHubSource, /readinessMetric\(prometheusReadiness/);
  assert.match(homeHubSource, /readinessMetric\(victoriaLogsReadiness/);
});

test("login public status shows the same readonly probe status vocabulary", () => {
  assert.match(loginSource, /function probeStatusTile/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.vcenter/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.pve/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.openwrt/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.ikuai/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.prometheus/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.victoriaLogs/);
  assert.match(loginSource, /readonly_reachable/);
  assert.match(loginSource, /datasource_error/);
});
