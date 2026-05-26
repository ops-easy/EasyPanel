import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const baotaSettingsSource = read("../src/features/baota/pages/BaotaSettingsPage.tsx");
const openClawBootstrapSource = read("../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx");
const cloudVmBootstrapSource = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx");

test("baota settings uses the shared module content width", () => {
  assert.match(baotaSettingsSource, /<div className="mx-auto w-full space-y-8 pb-12">/);
  assert.doesNotMatch(baotaSettingsSource, /max-w-4xl/);
});

test("app center bootstrap pages use the shared module content width", () => {
  for (const [label, source] of [
    ["openclaw bootstrap", openClawBootstrapSource],
    ["container host bootstrap", cloudVmBootstrapSource],
  ]) {
    assert.match(source, /<div className="mx-auto w-full space-y-6">/, `${label} should use full available width`);
    assert.doesNotMatch(source, /max-w-3xl/, `${label} should not cap itself to a narrow column`);
  }
});
