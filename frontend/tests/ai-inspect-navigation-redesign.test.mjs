import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const exists = (path) => existsSync(new URL(path, import.meta.url));

function assertInOrder(source, needles, message) {
  let previous = -1;
  for (const needle of needles) {
    const current = source.indexOf(needle);
    assert.ok(current >= 0, `${message}: missing ${needle}`);
    assert.ok(current > previous, `${message}: ${needle} is out of order`);
    previous = current;
  }
}

test("AI inspect navigation is grouped by operator workflow", () => {
  assert.equal(exists("../src/features/ops/ai-inspect/aiInspectNavigation.ts"), true);

  const nav = read("../src/features/ops/ai-inspect/aiInspectNavigation.ts");
  assert.match(nav, /AI_INSPECT_NAV_GROUPS/);
  assert.match(nav, /isAiInspectNavItemActive/);
  assertInOrder(
    nav,
    [
      'label: "总览"',
      'label: "观测与巡检总览"',
      'label: "发现与定位"',
      'label: "监控看板"',
      'label: "告警与通知"',
      'label: "日志检索"',
      'label: "巡检输出"',
      'label: "巡检报告"',
      'label: "接入与设置"',
      'label: "日志接入"',
      'label: "巡检策略"',
    ],
    "AI inspect grouped navigation"
  );

  assert.match(nav, /pathname === "\/cluster\/ai-inspect\/logs"/);
  assert.match(nav, /pathname\.startsWith\("\/cluster\/ai-inspect\/logs\/"\)/);
  assert.match(nav, /pathname === "\/cluster\/ai-inspect\/log-collection"/);
});

test("AI inspect sidebar and dashboard use the shared grouped navigation", () => {
  const sidebar = read("../src/shared/layout/Sidebar.tsx");
  const dashboard = read("../src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx");

  assert.match(sidebar, /AI_INSPECT_NAV_GROUPS/);
  assert.match(sidebar, /isAiInspectNavItemActive/);
  assert.match(sidebar, /group\.items\.map/);
  assert.doesNotMatch(sidebar, /<span>日志查询<\/span>/);
  assert.doesNotMatch(sidebar, /<span>日志采集<\/span>/);
  assert.doesNotMatch(sidebar, /<span>监控中心<\/span>/);
  assert.doesNotMatch(sidebar, /<span>告警中心<\/span>/);
  assert.doesNotMatch(sidebar, /<span>巡检配置<\/span>/);

  assert.match(dashboard, /AI_INSPECT_NAV_ITEMS_BY_ID/);
  assert.match(dashboard, /item=\{navItems\.monitoring\}/);
  assert.match(dashboard, /item=\{navItems\.alerts\}/);
  assert.match(dashboard, /item=\{navItems\.logs\}/);
  assert.match(dashboard, /item=\{navItems\.reports\}/);
  assert.match(dashboard, /item=\{navItems\.logCollection\}/);
  assert.match(dashboard, /item=\{navItems\.configure\}/);
});

test("AI inspect shell copy is provider-neutral and follows the new workflow names", () => {
  const header = read("../src/shared/layout/Header.tsx");
  const homeHub = read("../src/pages/HomeHub.tsx");

  assert.doesNotMatch(header, /OpenClaw/);
  assert.match(header, /监控看板 · 告警通知 · 日志检索/);

  assert.match(homeHub, /监控看板、告警通知、日志检索与巡检报告/);
  assert.doesNotMatch(homeHub, /监控告警、日志查询与采集/);
});
