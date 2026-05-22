import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/pages/HomeHub.tsx", import.meta.url), "utf8");

function count(pattern) {
  return source.match(pattern)?.length ?? 0;
}

test("workbench module cards share the same summary and hint structure", () => {
  assert.match(source, /function HubStatusPill/);
  assert.match(source, /function HubMetricGrid/);
  assert.match(source, /function HubCardHint/);
  assert.match(source, /min-h-\[360px\]/);

  assert.equal(count(/<HubMetricGrid/g), 8, "each visible workbench module card should have one metric grid");
  assert.equal(count(/<HubCardHint/g), 8, "each visible workbench module card should have one small hint");
  assert.equal(count(/<StatusBadge/g), 3, "configuration cards should share the same configured/unconfigured badge");
});

test("workbench cards avoid bespoke nested summary cards", () => {
  assert.doesNotMatch(source, /rounded-xl border border-gray-100 bg-gray-50\/80/);
  assert.doesNotMatch(source, /rounded-full bg-/, "status pills should go through HubStatusPill");
});

test("workbench module cards can grow instead of clipping dense summaries", () => {
  assert.doesNotMatch(source, /(?<!min-)h-\[360px\]/, "cards should use a minimum height, not a fixed height");
  assert.doesNotMatch(source, /overflow-hidden/, "cards should not clip longer summaries or entry links");
});

test("unconfigured PVE and OpenWrt cards link directly to their setup pages", () => {
  assert.match(source, /const pveNeedsSetup = !pveTargetsQ\.isLoading && nPveTargets === 0;/);
  assert.match(source, /to=\{pveNeedsSetup \? "\/cluster\/compute\/pve\/targets" : "\/cluster\/compute\/dashboard"\}/);
  assert.match(source, /配置 PVE 目标/);

  assert.match(source, /const openWrtNeedsSetup = !networkDevicesQ\.isLoading && nOpenWrtDevices === 0;/);
  assert.match(source, /to=\{openWrtNeedsSetup \? "\/cluster\/network\/openwrt\/dashboard" : "\/cluster\/network\/dashboard"\}/);
  assert.match(source, /配置 OpenWrt/);
});
