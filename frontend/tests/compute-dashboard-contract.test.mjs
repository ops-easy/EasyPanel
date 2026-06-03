import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const read = (path) => readFileSync(url(path), "utf8");
const exists = (path) => existsSync(url(path));

test("compute dashboard is an operations overview instead of only entry cards", () => {
  const dashboard = read("../src/features/compute/pages/ComputeDashboard.tsx");

  assert.match(dashboard, /ComputePageHeader/);
  assert.match(dashboard, /ComputeProviderHealthStrip/);
  assert.match(dashboard, /\/api\/compute\/summary/);
  assert.match(dashboard, /queryKey: \["compute-dashboard-cloud-vm-instances"\]/);
  assert.match(dashboard, /\/api\/app-center\/cloud-vm\/instances/);
  assert.match(dashboard, /const cloudVmCount = cloudVmQ\.data\?\.instances\?\.length \?\? 0;/);
  assert.match(dashboard, /useRuntimeStatusQuery/);
  assert.match(dashboard, /const vcenterReadiness = check\?\.checks\?\.vcenter;/);
  assert.match(dashboard, /const pveReadiness = check\?\.checks\?\.pve;/);
  assert.match(dashboard, /const providerConfiguredFallback = \(providerKey: "vcenter" \| "pve"\) =>/);
  assert.match(dashboard, /const vcenterConfigured = vcenterReadiness \? readinessIsConfigured\(vcenterReadiness\) : providerConfiguredFallback\("vcenter"\);/);
  assert.match(dashboard, /const pveConfigured = pveReadiness \? readinessIsConfigured\(pveReadiness\) : providerConfiguredFallback\("pve"\);/);
  assert.match(dashboard, /const hasVirtualizedAccess = vcenterConfigured \|\| pveConfigured;/);
  assert.match(dashboard, /const providerConfigured = hasVirtualizedAccess \|\| cloudVmCount > 0;/);
  assert.match(dashboard, /const computePrimaryPath = hasReadyVirtualizedAccess\s+\? "\/cluster\/compute\/guests"\s+:\s+cloudVmCount > 0\s+\? "\/cluster\/apps\/cloud-vm"\s+:\s+"\/cluster\/compute\/config";/);
  assert.match(dashboard, /readinessMetric\(vcenterReadiness/);
  assert.match(dashboard, /readinessHint\("vCenter", vcenterReadiness\)/);
  assert.match(dashboard, /虚拟化 Dashboard/);
  assert.match(dashboard, /今日关注/);
  assert.match(dashboard, /异常资源/);
  assert.match(dashboard, /容量热点/);
  assert.match(dashboard, /最近活动/);
  assert.match(dashboard, /资源入口/);
  assert.match(dashboard, /先配置 vCenter、PVE 或容器主机/);
  assert.match(dashboard, /vCenter、PVE 与容器主机的可用配置/);
  assert.doesNotMatch(dashboard, /先接入|等待接入|接入源/);
  assert.match(dashboard, /to="\/cluster\/apps\/cloud-vm"/);
  assert.match(dashboard, /to="\/cluster\/compute\/config"/);
});

test("compute dashboard shared components exist", () => {
  assert.equal(exists("../src/features/compute/components/ComputePageHeader.tsx"), true);
  assert.equal(exists("../src/features/compute/components/ComputeProviderHealthStrip.tsx"), true);

  const healthStrip = read("../src/features/compute/components/ComputeProviderHealthStrip.tsx");
  assert.match(healthStrip, /vCenter/);
  assert.match(healthStrip, /PVE/);
  assert.match(healthStrip, /readinessByProvider/);
  assert.match(healthStrip, /readinessMetric/);
  assert.match(healthStrip, /readinessHint/);
});
