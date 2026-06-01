import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/features/cluster/pages/podPhaseStyle.ts", import.meta.url),
  "utf8"
);

test("pod phase badge style tolerates missing phase values", () => {
  assert.match(source, /phase\?:\s*string/);
  assert.match(source, /String\(phase\s*\?\?\s*""\)\.toLowerCase\(\)/);
});
