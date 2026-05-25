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

test("Hermes page carries create/bootstrap tabs plus exposure and runtime readiness fields", () => {
  const create = read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx");

  assert.match(create, /HERMES_BOOTSTRAP_PATH = "\/cluster\/apps\/hermes\/bootstrap"/);
  assert.match(create, /export type HermesPageTab = "list" \| "create" \| "bootstrap"/);
  assert.match(create, /initialTab = "create"/);
  assert.match(create, /const \[tab, setTab\] = useState<HermesPageTab>\(initialTab\)/);
  assert.match(create, /<Link to=\{HERMES_BOOTSTRAP_PATH\}/);
  assert.match(create, /<Tabs value=\{tab\} onValueChange=\{\(value\) => setTab\(value as HermesPageTab\)\}/);
  for (const value of ["create", "bootstrap", "list"]) {
    assert.match(create, new RegExp(`TabsTrigger value="${value}"`));
    assert.match(create, new RegExp(`TabsContent value="${value}"`));
  }
  assert.match(create, /HERMES_CAPABILITIES/);

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
