import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(__dirname, path), "utf8");

const settingsSource = read("../src/features/compute/pages/VirtualMachineSettings.tsx");

test("compute config uses provider health instead of hard-coded setup copy", () => {
  assert.match(settingsSource, /ComputePageHeader/);
  assert.match(settingsSource, /ComputeStatusBadge/);
  assert.match(settingsSource, /\/api\/compute\/providers/);
  assert.match(settingsSource, /providerStatus/);
  assert.match(settingsSource, /配置源状态/);
  assert.match(settingsSource, /refreshing=\{cfgQ\.isLoading \|\| providersQ\.isFetching\}/);
});
