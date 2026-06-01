import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const source = read("../src/features/dns/pages/DnsFailover.tsx");
const dashboardSource = read("../src/features/dns/pages/DnsDashboard.tsx");
const routeInventory = read("../src/app/route-inventory.ts");
const renderScript = read("../../scripts/generate-demo-assets.mjs");

test("DNS failover page exposes all backend-supported probes and transition result fields", () => {
  assert.match(source, /<SelectItem value="ping">Ping<\/SelectItem>/);
  assert.match(source, /配置 HTTP\/HTTPS\/TCP\/Ping 探针/);
  assert.match(dashboardSource, /配置 HTTP\/HTTPS\/TCP\/Ping 探针/);
  assert.doesNotMatch(source, /暂不支持/);
  assert.match(source, /后台按检测间隔自动执行/);
  assert.match(source, /立即检测会触发切换或恢复/);
  assert.match(source, /apiPostJson<\{ ok: boolean; message: string; action: string; errorCount: number \}>/);
});

test("DNS failover page validates the DNS record switching inputs before saving", () => {
  assert.match(source, /disabled=\{saveMut\.isPending \|\| !form\.name \|\| !form\.domainId \|\| !form\.checkTarget \|\| !form\.originalValue \|\| !form\.failoverValue\}/);
  assert.doesNotMatch(source, /解析记录 ID（可选）/);
});

test("DNS failover page is covered by render smoke with API mocks", () => {
  assert.match(routeInventory, /"\/cluster\/apps\/dns\/failover"/);
  assert.match(renderScript, /"\/cluster\/apps\/dns\/failover": \{ expectedText: "健康监测 \/ 故障切换" \}/);
  assert.match(renderScript, /pathname === "\/api\/dns\/failover"/);
  assert.match(renderScript, /dns\\\/failover\\\/\[\^\/\]\+\\\/logs/);
});
