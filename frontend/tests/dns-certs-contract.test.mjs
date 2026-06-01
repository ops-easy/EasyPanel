import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const source = read("../src/features/dns/pages/DnsCerts.tsx");
const routeInventory = read("../src/app/route-inventory.ts");
const renderScript = read("../../scripts/generate-demo-assets.mjs");

test("DNS cert orders must bind to a DNS account before applying", () => {
  assert.match(source, /apiGetJson<\{ accounts: Account\[\] \}>\("\/api\/dns\/accounts"/);
  assert.match(source, /accountId: number/);
  assert.match(source, /const defaultForm = \(accountId = 0\)/);
  assert.match(source, /apiPostJson\(\s*"\/api\/dns\/certs",[\s\S]*accountId: form\.accountId/);
  assert.match(source, /<Select value=\{form\.accountId \? String\(form\.accountId\) : ""\}/);
  assert.match(source, /<SelectValue placeholder="选择 DNS 服务商账号" \/>/);
  assert.match(source, /disabled=\{saveMut\.isPending \|\| !form\.name \|\| !form\.domains \|\| !form\.accountId\}/);
});

test("DNS cert page no longer advertises a future-only certificate flow", () => {
  assert.doesNotMatch(source, /后续版本|完整签发流程就绪后生效|自动化签发就绪后生效/);
  assert.match(source, /自动添加 <code>_acme-challenge<\/code> TXT 记录/);
  assert.match(source, /签发成功后自动推送到宝塔/);
});

test("DNS cert page is covered by render smoke with API mocks", () => {
  assert.match(routeInventory, /"\/cluster\/apps\/dns\/certs"/);
  assert.match(renderScript, /"\/cluster\/apps\/dns\/certs": \{ expectedText: "SSL 证书" \}/);
  assert.match(renderScript, /pathname === "\/api\/dns\/certs"/);
});
