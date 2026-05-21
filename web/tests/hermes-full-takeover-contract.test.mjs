import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Hermes detail page exposes real runtime management panels", () => {
  const detail = read("../src/features/app-center/hermes/pages/AppCenterHermesDetail.tsx");
  const probe = read("../src/features/app-center/hermes/pages/HermesProbePanel.tsx");
  const exposure = read("../src/features/app-center/hermes/pages/HermesExposurePanel.tsx");
  const upgrade = read("../src/features/app-center/hermes/pages/HermesUpgradeDialog.tsx");
  const logsEvents = read("../src/features/app-center/hermes/pages/HermesLogsEventsPanel.tsx");

  for (const component of ["HermesProbePanel", "HermesExposurePanel", "HermesUpgradeDialog", "HermesLogsEventsPanel"]) {
    assert.match(detail, new RegExp(component));
  }

  assert.match(probe, /\/probe/);
  assert.match(exposure, /\/exposure/);
  assert.match(upgrade, /\/upgrade/);
  assert.match(upgrade, /\/rollback/);
  assert.match(logsEvents, /\/logs\?tail=/);
  assert.match(logsEvents, /\/events/);
});

test("Hermes create page carries exposure and runtime readiness fields", () => {
  const create = read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx");

  for (const value of ["clusterIP", "nodePort", "loadBalancer", "ingress"]) {
    assert.match(create, new RegExp(value));
  }

  assert.match(create, /exposeMode/);
  assert.match(create, /nodePort:\s*Number\(form\.nodePort\)/);
  assert.match(create, /replicas:\s*Number\(form\.replicas\)/);
  assert.match(create, /Ingress Host/);
  assert.match(create, /Public URL/);
  assert.match(create, /lastProbeError/);
});

test("AI inspect only allows runtime-ready Hermes gateway instances", () => {
  const aiInspect = read("../src/features/ops/ai-inspect/pages/AiInspectHome.tsx");

  assert.match(aiInspect, /ready\?: boolean/);
  assert.match(aiInspect, /\(x\.mode \|\| ""\)\.includes\("gateway"\) && x\.ready === true/);
});
