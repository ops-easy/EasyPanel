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

test("uses platform confirmation dialogs for IP scan write actions", () => {
  const helper = readFileSync(
    new URL("../src/features/cluster/lib/toolMutationConfirm.ts", import.meta.url),
    "utf8"
  );

  assert.match(helper, /withToolMutationConfirm/);
  assert.doesNotMatch(helper, /confirmToolMutation/);
  assert.doesNotMatch(helper, /window\.confirm/);
  assert.match(source, /ConfirmActionButton/);
  assert.match(source, /withToolMutationConfirm/);
  assert.doesNotMatch(source, /confirmToolMutation|window\.confirm|\bconfirm\s*\(/);
});
