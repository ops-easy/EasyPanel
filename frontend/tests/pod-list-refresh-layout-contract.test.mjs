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

test("pod table row actions stay fully visible in horizontal overflow", () => {
  assert.match(
    source,
    /<Table className="min-w-\[1320px\]">/,
    "The Pod table needs a stable minimum width so browsers do not squeeze the action column"
  );

  const actionHeader = sliceBetween(
    '<TableHead className="sticky right-0',
    "\n                    操作"
  );

  assert.match(
    actionHeader,
    /w-\[244px\][\s\S]*min-w-\[244px\]/,
    "The action column needs enough stable width for detail, log, edit, and delete controls"
  );
  assert.match(
    actionHeader,
    /bg-white\/95[\s\S]*shadow-\[-10px_0_16px_-14px_rgba\(15,23,42,0\.45\)\]/,
    "The pinned action header should cover scrolled content instead of visually clipping"
  );

  const actionCell = sliceBetween(
    '<TableCell className="sticky right-0',
    '<div className="flex'
  );

  assert.match(
    actionCell,
    /w-\[244px\][\s\S]*min-w-\[244px\]/,
    "Each action cell should reserve the same width as the header"
  );
  assert.match(
    source,
    /className="flex w-full flex-nowrap items-center justify-end gap-1"/,
    "The table action group should fill the pinned column without wrapping or spilling outside it"
  );
});
