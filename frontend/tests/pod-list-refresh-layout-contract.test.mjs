import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../src/features/cluster/pages/PodListBlock.tsx", import.meta.url),
  "utf8"
);

function sliceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("pod row data auto-refreshes alongside pod metrics", () => {
  const podsQuery = sliceBetween("const podsQ = useQuery({", "const metricsQ = useQuery({");

  assert.match(
    podsQuery,
    /refetchInterval:\s*30_000/,
    "Pod list data must refresh automatically so phase, node, restart, and age columns do not stay stale"
  );
});

test("pod table row actions stay in one horizontal action group", () => {
  const actionHeader = sliceBetween(
    '<TableHead className="min-w-[',
    "\n                    操作"
  );

  assert.match(
    actionHeader,
    /min-w-\[(?:260|272|280)px\]/,
    "The action column needs enough stable width for detail, log, edit, and delete controls"
  );
  assert.match(
    source,
    /className="flex flex-nowrap items-center justify-end gap-1"/,
    "The table action group should not wrap into stacked controls on desktop"
  );
});
