import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Hermes frontend normalizes the legacy GHCR image before prefilling forms", () => {
  const helperPath = new URL("../src/features/app-center/hermes/hermesImage.ts", import.meta.url);
  assert.equal(existsSync(helperPath), true, "Hermes image compatibility helper should exist");

  const helper = read("../src/features/app-center/hermes/hermesImage.ts");
  const overview = read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx");
  const detail = read("../src/features/app-center/hermes/pages/AppCenterHermesDetail.tsx");
  const upgrade = read("../src/features/app-center/hermes/pages/HermesUpgradeDialog.tsx");

  assert.match(helper, /ghcr\.io\/nousresearch\/hermes-agent:latest/);
  assert.match(helper, /nousresearch\/hermes-agent:latest/);
  assert.match(overview, /normalizeHermesImage\(boot\?\.defaultImage/);
  assert.match(overview, /normalizeHermesImage\(row\.image\)/);
  assert.match(detail, /normalizeHermesImage\(inst(?:\?\.)?\.image\)/);
  assert.match(upgrade, /setImage\(normalizeHermesImage\(instance\?\.image \|\| ""\)\)/);
  assert.match(upgrade, /image:\s*normalizeHermesImage\(image\)/);
});
