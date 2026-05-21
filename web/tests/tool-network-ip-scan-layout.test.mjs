import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/features/cluster/pages/ToolNetworkIpScan.tsx", import.meta.url),
  "utf8"
);

test("uses a bounded operator-console layout instead of full-width stacked forms", () => {
  assert.match(source, /max-w-\[min\(100%,92rem\)\]/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,430px\)_minmax\(0,1fr\)\]/);
  assert.match(source, /扫描队列/);
  assert.doesNotMatch(source, /<div className="space-y-8">/);
});
