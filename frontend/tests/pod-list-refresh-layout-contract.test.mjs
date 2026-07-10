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
    /<div className="\[&_\[data-slot=table-container\]\]:pb-2">/,
    "The Pod table should use the shared table scroll container and leave breathing room above the horizontal scrollbar"
  );

  assert.match(
    source,
    /<Table className="min-w-\[1240px\]">/,
    "The Pod table should be wide enough for data columns without forcing awkward desktop overflow"
  );

  const actionHeader = sliceBetween(
    '<TableHead className="sticky right-0',
    "\n                    操作"
  );

  assert.match(
    actionHeader,
    /w-\[220px\][\s\S]*min-w-\[220px\]/,
    "The action column needs enough stable width for detail, log, edit, and delete controls"
  );
  assert.match(
    actionHeader,
    /border-l[\s\S]*border-slate-100\/80[\s\S]*bg-white/,
    "The pinned action header should feel integrated with the table instead of looking like a floating white slab"
  );
  assert.doesNotMatch(
    actionHeader,
    /shadow-\[-10px_0_16px_-14px_rgba/,
    "The pinned action header should not use a heavy overlay shadow"
  );

  const actionCell = sliceBetween(
    '<TableCell className="sticky right-0',
    '<div className="flex'
  );

  assert.match(
    actionCell,
    /w-\[220px\][\s\S]*min-w-\[220px\]/,
    "Each action cell should reserve the same width as the header"
  );
  assert.match(
    actionCell,
    /border-l[\s\S]*border-slate-100\/80[\s\S]*bg-inherit/,
    "Pinned action cells should inherit the row surface and use only a subtle divider"
  );
  assert.doesNotMatch(
    actionCell,
    /shadow-\[-10px_0_16px_-14px_rgba/,
    "Pinned action cells should not look like a separate overlay panel"
  );
  assert.match(
    source,
    /className="flex w-full flex-nowrap items-center justify-end gap-1\.5"/,
    "The table action group should fill the pinned column with comfortable, non-wrapping spacing"
  );
});
