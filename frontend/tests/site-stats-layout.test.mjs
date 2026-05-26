import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const siteStatsSource = read("../src/features/account/pages/SiteStats.tsx");

test("site stats path ranking uses a compact scannable layout", () => {
  assert.match(siteStatsSource, /const siteStatsPathRowGridClass =/);
  assert.match(
    siteStatsSource,
    /md:grid-cols-\[2\.75rem_minmax\(0,1\.6fr\)_minmax\(12rem,0\.8fr\)_7rem\]/
  );
  assert.match(siteStatsSource, /const maxPathCount =/);
  assert.match(siteStatsSource, /路径/);
  assert.match(siteStatsSource, /来源模块/);
  assert.match(siteStatsSource, /访问次数/);
  assert.match(siteStatsSource, /sticky top-0/);
  assert.match(siteStatsSource, /title=\{row\.path\}/);
  assert.match(siteStatsSource, /style=\{\{ width:/);
  assert.doesNotMatch(siteStatsSource, /max-h-\[360px\] space-y-2 overflow-y-auto/);
  assert.doesNotMatch(siteStatsSource, /min-w-0 break-all/);
});

test("site stats IP rankings use compact rows with proportional bars", () => {
  assert.match(siteStatsSource, /const siteStatsIpRowGridClass =/);
  assert.match(siteStatsSource, /grid-cols-\[2\.25rem_minmax\(0,1fr\)_5\.5rem\]/);
  assert.match(siteStatsSource, /const topClientIPs =/);
  assert.match(siteStatsSource, /const loginFailsByIP =/);
  assert.match(siteStatsSource, /const maxClientIpCount =/);
  assert.match(siteStatsSource, /const maxLoginFailIpCount =/);
  assert.match(siteStatsSource, /function renderIpRanking/);
  assert.match(siteStatsSource, /IP 地址/);
  assert.match(siteStatsSource, /次数/);
  assert.match(siteStatsSource, /style=\{\{ width: countWidth \}\}/);
  assert.doesNotMatch(siteStatsSource, /max-h-\[280px\] space-y-1\.5 overflow-y-auto font-mono/);
  assert.doesNotMatch(siteStatsSource, /flex justify-between gap-2 border-b border-slate-50 pb-1/);
});
