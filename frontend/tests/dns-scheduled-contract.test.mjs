import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const source = read("../src/features/dns/pages/DnsScheduled.tsx");
const routeInventory = read("../src/app/route-inventory.ts");
const renderScript = read("../../scripts/generate-demo-assets.mjs");

test("DNS scheduled tasks require an explicit synced record target", () => {
  assert.match(source, /<Label>解析记录 ID<\/Label>/);
  assert.match(source, /placeholder="填写已同步解析记录 ID"/);
  assert.doesNotMatch(source, /解析记录 ID（可选）|留空=操作域名/);
  assert.match(source, /disabled=\{saveMut\.isPending \|\| !form\.name \|\| !form\.domainId \|\| !form\.recordId \|\| \(form\.action === "modify" && !form\.newValue\)\}/);
});

test("DNS scheduled page is covered by render smoke with API mocks", () => {
  assert.match(routeInventory, /"\/cluster\/apps\/dns\/scheduled"/);
  assert.match(renderScript, /"\/cluster\/apps\/dns\/scheduled": \{ expectedText: "定时任务" \}/);
  assert.match(renderScript, /pathname === "\/api\/dns\/scheduled"/);
});
