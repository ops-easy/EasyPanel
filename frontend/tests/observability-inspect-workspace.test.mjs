import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

test("AI inspect workspace is presented as observability and inspection", () => {
  const nav = read("../src/features/ops/ai-inspect/aiInspectNavigation.ts");
  const header = read("../src/shared/layout/Header.tsx");
  const sidebar = read("../src/shared/layout/Sidebar.tsx");
  const homeHub = read("../src/pages/HomeHub.tsx");
  const mobile = read("../src/shared/layout/AppLayoutMobile.tsx");

  for (const [name, source] of [
    ["nav", nav],
    ["header", header],
    ["sidebar", sidebar],
    ["homeHub", homeHub],
  ]) {
    assert.match(source, /观测与巡检/, `${name} should use the new workspace name`);
  }

  assert.match(mobile, /观测与巡检|ai-inspect/, "mobile shell should keep the route available");
  assert.doesNotMatch(header, /<span className="font-medium">AI 巡检<\/span>/);
  assert.doesNotMatch(homeHub, /<h2 className="mt-4 text-base font-semibold text-gray-900">AI 巡检<\/h2>/);
});

test("observability dashboard is a status hub instead of feature cards only", () => {
  assert.equal(exists("../src/features/ops/ai-inspect/components/AccessHealthMatrix.tsx"), true);
  assert.equal(exists("../src/features/ops/ai-inspect/components/CurrentRiskPanel.tsx"), true);
  assert.equal(exists("../src/features/ops/ai-inspect/components/NextStepPanel.tsx"), true);

  const dashboard = read("../src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx");
  assert.match(dashboard, /AccessHealthMatrix/);
  assert.match(dashboard, /CurrentRiskPanel/);
  assert.match(dashboard, /NextStepPanel/);
  assert.match(dashboard, /观测与巡检总览/);
  assert.match(dashboard, /PVE/);
  assert.match(dashboard, /Network|网络/);
  assert.doesNotMatch(dashboard, />Dashboard</);
});

test("strategy and log access pages are split into focused components", () => {
  for (const path of [
    "../src/features/ops/ai-inspect/components/AIProviderConfigPanel.tsx",
    "../src/features/ops/ai-inspect/components/InspectionScopePanel.tsx",
    "../src/features/ops/ai-inspect/components/InspectionSchedulePanel.tsx",
    "../src/features/ops/ai-inspect/components/InspectionRunPanel.tsx",
    "../src/features/ops/ai-inspect/components/ProviderScenarioOverridesPanel.tsx",
    "../src/features/ops/ai-inspect/components/LogPresetSelector.tsx",
    "../src/features/ops/ai-inspect/components/VectorScriptPanel.tsx",
    "../src/features/ops/ai-inspect/components/OpenSearchDualWritePanel.tsx",
    "../src/features/ops/ai-inspect/components/SshInstallTaskPanel.tsx",
    "../src/features/ops/ai-inspect/components/LogIngestionVerificationPanel.tsx",
  ]) {
    assert.equal(exists(path), true, `${path} should exist`);
  }

  const strategy = read("../src/features/ops/ai-inspect/pages/AiInspectHome.tsx");
  assert.match(strategy, /AIProviderConfigPanel/);
  assert.match(strategy, /InspectionScopePanel/);
  assert.match(strategy, /InspectionSchedulePanel/);
  assert.match(strategy, /InspectionRunPanel/);
  assert.match(strategy, /ProviderScenarioOverridesPanel/);

  const shipper = read("../src/features/ops/ai-inspect/pages/VmLogShipperAssistant.tsx");
  assert.match(shipper, /LogPresetSelector/);
  assert.match(shipper, /VectorScriptPanel/);
  assert.match(shipper, /OpenSearchDualWritePanel/);
  assert.match(shipper, /SshInstallTaskPanel/);
  assert.match(shipper, /LogIngestionVerificationPanel/);
});

test("alerts expose metric and log troubleshooting links", () => {
  const alerts = read("../src/features/ops/ai-inspect/pages/AiInspectAlerts.tsx");

  assert.match(alerts, /buildAlertTroubleshootingLinks/);
  assert.match(alerts, /\/cluster\/ai-inspect\/monitoring/);
  assert.match(alerts, /\/cluster\/ai-inspect\/logs/);
  assert.match(alerts, /alertQuery/);
  assert.match(alerts, /timeWindow/);
});

test("provider-neutral surfaces do not describe generic inspection as OpenClaw-only", () => {
  const notification = read("../src/shared/layout/HeaderNotificationsSheet.tsx");
  const report = read("../src/features/ops/ai-inspect/pages/InspectReportRich.tsx");
  const chat = read("../src/shared/layout/AIChatSheet.tsx");

  assert.doesNotMatch(notification, /巡检 OpenClaw/);
  assert.match(notification, /AI Provider 汇总|Provider 汇总/);
  assert.doesNotMatch(report, /OpenClaw 网关<\/span>」开头的是平台访问/);
  assert.match(report, /AI Provider 网关|Provider 网关/);
  assert.doesNotMatch(chat, /OpenClaw \/ Hermes 接入/);
  assert.match(chat, /AI Provider 接入/);
});
