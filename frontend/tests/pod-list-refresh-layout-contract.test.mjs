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

test("pod metrics table uses product-facing resource ratio wording", () => {
  assert.doesNotMatch(
    source,
    />\s*对齐\s*</,
    "The Pod metrics table should not expose the internal-sounding '对齐' label"
  );
  assert.doesNotMatch(
    source,
    /对齐列为/,
    "The Pod metrics helper copy should explain the ratio directly instead of referencing a '对齐' column"
  );
  assert.match(
    source,
    />\s*使用\/申请\s*</,
    "The Pod ratio column should be named after what it shows"
  );
  assert.match(
    source,
    /资源占比 = 实际用量 ÷ requests/,
    "The table helper copy should define the CPU and memory ratio in user-facing language"
  );
  assert.match(
    source,
    /30s 自动刷新/,
    "The refresh cadence should be shown as a compact table status badge"
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
  assert.match(
    actionHeader,
    /text-left/,
    "The action header should align left like the other table headers"
  );
  assert.doesNotMatch(
    actionHeader,
    /text-right/,
    "The action header should not be the only right-aligned table header"
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
  assert.match(
    actionCell,
    /text-left/,
    "Action cells should keep the same left-aligned rhythm as the rest of the table"
  );
  assert.doesNotMatch(
    actionCell,
    /text-right/,
    "Action cells should not push the controls away from the rest of the row"
  );
  assert.doesNotMatch(
    actionCell,
    /shadow-\[-10px_0_16px_-14px_rgba/,
    "Pinned action cells should not look like a separate overlay panel"
  );
  assert.match(
    source,
    /className="flex w-full flex-nowrap items-center justify-start gap-1\.5"/,
    "The table action group should start from the left edge like the other columns"
  );
  assert.match(
    source,
    /ClusterRowActionsMenu/,
    "Pod secondary actions should use the shared collapsed row action menu"
  );
  assert.match(
    source,
    /label:\s*"编辑 YAML"[\s\S]*label:\s*"删除 Pod"[\s\S]*variant:\s*"destructive"/,
    "Edit YAML and delete should be folded behind the row's More menu"
  );
  assert.doesNotMatch(
    source,
    /title="编辑 YAML"[\s\S]{0,260}<Pencil className="h-3\.5 w-3\.5" \/>[\s\S]{0,260}<\/Button>[\s\S]{0,260}<Button[\s\S]{0,260}title="删除 Pod"/,
    "The Pod table should not expose edit and delete as separate inline icon buttons"
  );
  assert.match(
    source,
    /title="查看 Pod 详情"[\s\S]*aria-label="查看 Pod 详情"/,
    "The detail action needs an explicit title and accessible name"
  );
  assert.match(
    source,
    /title=\{!p\.firstContainer \? "无可用容器名，无法查看日志" : "查看 Pod 日志"\}[\s\S]*aria-label="查看 Pod 日志"/,
    "The log action needs an explicit title and accessible name"
  );
});
