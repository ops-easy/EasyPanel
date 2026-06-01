import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("VM log shipper assistant imports hooks used by the collector summary", () => {
  const source = read("../src/features/ops/ai-inspect/pages/VmLogShipperAssistant.tsx");

  assert.match(source, /import React,\s*\{\s*useCallback,\s*useEffect,\s*useMemo,\s*useState\s*\} from "react";/);
  assert.match(source, /const enabledCollectors = useMemo<VmShipperEnabledItem\[\]>/);
});
