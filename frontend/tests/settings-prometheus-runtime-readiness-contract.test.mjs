import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const settingsPrometheus = readFileSync(
  new URL("../src/features/settings/components/SettingsPrometheusSection.tsx", import.meta.url),
  "utf8"
);
const homeHub = readFileSync(new URL("../src/pages/HomeHub.tsx", import.meta.url), "utf8");
const aiDashboard = readFileSync(
  new URL("../src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx", import.meta.url),
  "utf8"
);
const aiMonitoring = readFileSync(
  new URL("../src/features/ops/ai-inspect/pages/AiInspectMonitoring.tsx", import.meta.url),
  "utf8"
);

function functionBody(source, name) {
  const match = source.match(new RegExp(`const ${name} = (?:async )?\\(\\) => \\{([\\s\\S]*?)\\n  \\};`));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

test("Prometheus settings mutations refresh the runtime readiness cache used by workbench and AI inspect", () => {
  const refreshBody = functionBody(settingsPrometheus, "invalidateMonitoringReadiness");
  assert.match(
    refreshBody,
    /invalidateQueries\(\{\s*queryKey:\s*\["runtime-status"\]\s*\}\)/,
    "the shared monitoring readiness refresh should invalidate runtime-status"
  );

  for (const name of ["savePrometheus", "persistPrometheusToRuntime", "saveDatasourceDialog", "clearPrometheus"]) {
    const body = functionBody(settingsPrometheus, name);
    assert.match(
      body,
      /invalidateMonitoringReadiness\(\)/,
      `${name} should immediately refresh runtime-status after changing Prometheus or vmselect config`
    );
  }

  for (const [name, source] of [
    ["HomeHub", homeHub],
    ["AiInspectDashboard", aiDashboard],
    ["AiInspectMonitoring", aiMonitoring],
  ]) {
    assert.match(source, /useRuntimeStatusQuery/, `${name} should consume the shared runtime-status query`);
    assert.match(source, /check\?\.checks\?\.prometheus/, `${name} should use runtime readiness Prometheus data`);
  }
});

test("Prometheus settings page does not depend on the legacy prometheus status endpoint", () => {
  assert.match(settingsPrometheus, /useRuntimeStatusQuery/);
  assert.match(settingsPrometheus, /const prometheusReadiness = check\?\.checks\?\.prometheus/);
  assert.doesNotMatch(settingsPrometheus, /queryKey:\s*\["prometheus-status"\]/);
  assert.doesNotMatch(settingsPrometheus, /\/api\/prometheus\/status/);
});
