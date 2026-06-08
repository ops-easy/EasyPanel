import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const apiSource = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const readinessSource = readFileSync(new URL("../src/lib/system-readiness.ts", import.meta.url), "utf8");
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
  assert.match(homeHubSource, /from "@\/lib\/system-readiness"/);
  assert.doesNotMatch(homeHubSource, /function readinessStatus/);
  assert.doesNotMatch(homeHubSource, /function readinessMetric/);
  assert.doesNotMatch(homeHubSource, /function readinessHasProblem/);
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
  assert.match(loginSource, /from "@\/lib\/system-readiness"/);
  assert.match(loginSource, /readinessLoginSummary\(item,\s*pendingDetail\)/);
  assert.doesNotMatch(loginSource, /status === "readonly_reachable"/);
  assert.doesNotMatch(loginSource, /status === "configured_unreachable"/);
  assert.doesNotMatch(loginSource, /status === "datasource_error"/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.vcenter/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.pve/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.openwrt/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.ikuai/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.prometheus/);
  assert.match(loginSource, /payload\?\.systemCheck\?\.checks\?\.victoriaLogs/);
});

test("system readiness owns workbench and login presentation for reachable unreachable and hidden probes", () => {
  for (const helper of [
    "readinessStatus",
    "readinessHasProblem",
    "readinessIsReady",
    "readinessIsConfigured",
    "readinessMetric",
    "readinessHint",
    "readinessLoginSummary",
  ]) {
    assert.match(readinessSource, new RegExp(`export function ${helper}\\b`));
  }

  for (const status of ["readonly_reachable", "configured_unreachable", "hidden"]) {
    assert.match(readinessSource, new RegExp(`case "${status}"|status === "${status}"`));
  }

  assert.match(readinessSource, /readonly_reachable"[\s\S]*tone:\s*"ok"/);
  assert.match(readinessSource, /configured_unreachable"[\s\S]*tone:\s*"warn"/);
  assert.match(readinessSource, /hidden"[\s\S]*tone:\s*"hidden"/);
});
