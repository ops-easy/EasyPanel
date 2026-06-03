import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const computeDashboard = read("../src/features/compute/pages/ComputeDashboard.tsx");
const networkDashboard = read("../src/features/network/pages/NetworkDashboard.tsx");
const aiDashboard = read("../src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx");
const aiMonitoring = read("../src/features/ops/ai-inspect/pages/AiInspectMonitoring.tsx");

test("compute dashboard uses runtime systemCheck probes instead of provider-only readiness", () => {
  assert.match(computeDashboard, /useRuntimeStatusQuery/);
  assert.match(computeDashboard, /const vcenterReadiness = check\?\.checks\?\.vcenter/);
  assert.match(computeDashboard, /const pveReadiness = check\?\.checks\?\.pve/);
  assert.match(computeDashboard, /providerConfiguredFallback\("vcenter"\)/);
  assert.match(computeDashboard, /providerConfiguredFallback\("pve"\)/);
  assert.match(computeDashboard, /const hasVirtualizedAccess = vcenterConfigured \|\| pveConfigured/);
  assert.match(computeDashboard, /readinessMetric\(vcenterReadiness/);
  assert.match(computeDashboard, /readinessHint\("vCenter", vcenterReadiness\)/);
  assert.doesNotMatch(computeDashboard, /const providerConfigured = hasVirtualizedProviders \|\| cloudVmCount > 0;/);
});

test("network dashboard uses runtime systemCheck probes for provider and prometheus badges", () => {
  assert.match(networkDashboard, /useRuntimeStatusQuery/);
  assert.match(networkDashboard, /const openWrtReadiness = check\?\.checks\?\.openwrt/);
  assert.match(networkDashboard, /const ikuaiReadiness = check\?\.checks\?\.ikuai/);
  assert.match(networkDashboard, /const prometheusReadiness = check\?\.checks\?\.prometheus/);
  assert.match(networkDashboard, /const ikuaiConfigured = ikuaiReadiness \? readinessIsConfigured\(ikuaiReadiness\) : Boolean\(ikuaiDevice\)/);
  assert.match(networkDashboard, /const openWrtConfigured = openWrtReadiness \? readinessIsConfigured\(openWrtReadiness\) : Boolean\(openWrtDevice\)/);
  assert.match(networkDashboard, /readinessMetric\(prometheusReadiness/);
  assert.match(networkDashboard, /readinessHint\("Prometheus \/ VictoriaMetrics", prometheusReadiness\)/);
  assert.doesNotMatch(networkDashboard, /function providerReady/);
});

test("AI inspect dashboards use runtime systemCheck and avoid legacy prometheus status", () => {
  for (const [name, source] of [
    ["AiInspectDashboard", aiDashboard],
    ["AiInspectMonitoring", aiMonitoring],
  ]) {
    assert.match(source, /useRuntimeStatusQuery/, `${name} should read the unified runtime status cache`);
    assert.match(source, /check\?\.checks\?\.prometheus/, `${name} should read prometheus readiness from systemCheck`);
    assert.doesNotMatch(source, /\/api\/prometheus\/status/, `${name} should not call the legacy prometheus status endpoint`);
  }
  assert.match(aiDashboard, /readinessHint\("Prometheus \/ VictoriaMetrics", prometheusReadiness\)/);
  assert.match(aiMonitoring, /readinessMetric\(prometheusReadiness/);
});
