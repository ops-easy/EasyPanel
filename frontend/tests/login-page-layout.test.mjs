import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/pages/Login.tsx", import.meta.url), "utf8");

test("login module cards stay above the runtime status panel", () => {
  const moduleGrid = source.indexOf("HERO_MODULE_ITEMS.map");
  const runtimePanel = source.indexOf("<LoginRuntimeStatusPanel");

  assert.ok(moduleGrid >= 0, "login module card grid should exist");
  assert.ok(runtimePanel >= 0, "runtime status panel should exist");
  assert.ok(moduleGrid < runtimePanel, "module cards should appear before the runtime status panel");
});

test("login page keeps vertical scrolling available on desktop heights", () => {
  const mainShell = source.match(/<div className="login-page-v2[^"]*min-h-\[100dvh\][^"]+"/)?.[0] ?? "";

  assert.match(mainShell, /overflow-y-auto/);
  assert.doesNotMatch(mainShell, /lg:overflow-y-hidden/);
  assert.doesNotMatch(source, /style\.overflow = "hidden"/);
});

test("login runtime status uses PVE wording for virtualization access", () => {
  assert.match(source, /label: "PVE"/);
  assert.match(source, /配置 PVE 后纳管资源/);
  assert.match(source, /state: rt\?\.pveConfigured \? "已配置" : "未配置"/);
  assert.doesNotMatch(source, /label: "vCenter"/);
  assert.doesNotMatch(source, /虚拟化入口待接入/);
  assert.doesNotMatch(source, /PVE 入口待接入/);
  assert.doesNotMatch(source, /state: rt\?\.vcenterConfigured \? "已配置" : "未配置"/);
});

test("login runtime status uses actionable setup guidance instead of stale access placeholders", () => {
  assert.match(source, /保存面板 API 后启用同步/);
  assert.match(source, /配置解析参数后启用 DDNS/);
  assert.match(source, /配置 Redis 后启用缓存/);
  assert.match(source, /pendingCount > 0 \? "需配置" : "健康"/);
  assert.doesNotMatch(source, /待接入/);
  assert.doesNotMatch(source, /待完善/);
  assert.doesNotMatch(source, /面板 API 待接入/);
  assert.doesNotMatch(source, /域名解析待接入/);
  assert.doesNotMatch(source, /缓存能力待接入/);
});
