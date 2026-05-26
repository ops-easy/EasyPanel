import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("README presents EasyPanel like an open source project with generated visuals", () => {
  const readme = read("README.md");
  const expectedAssets = [
    "docs/demo/assets/easypanel-dashboard.png",
    "docs/demo/assets/easypanel-kubernetes.png",
    "docs/demo/assets/easypanel-app-center.png",
    "docs/demo/assets/easypanel-ingress.png",
  ];

  assert.match(readme, /!\[EasyPanel 工作台演示\]\(\.\/docs\/demo\/assets\/easypanel-dashboard\.png\)/);
  assert.match(readme, /## 界面预览/);
  assert.match(readme, /## 演示数据/);
  assert.match(readme, /\[自动生成演示数据\]\(\.\/docs\/demo\/demo-data\.json\)/);
  assert.doesNotMatch(readme, /docs\/demo\/assets\/[^)]+\.svg/);
  assert.doesNotMatch(readme, /preview\.html/);

  for (const asset of expectedAssets) {
    const absolutePath = resolve(root, asset);
    assert.ok(existsSync(absolutePath), `${asset} should exist`);
    const png = readFileSync(absolutePath);
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${asset} should be a PNG`);
    assert.ok(png.length > 40_000, `${asset} should contain a real screenshot-sized image`);
  }
});

test("generated demo data has realistic dashboard coverage", () => {
  const data = JSON.parse(read("docs/demo/demo-data.json"));

  assert.equal(data.product, "EasyPanel");
  assert.ok(Array.isArray(data.clusters) && data.clusters.length >= 2);
  assert.ok(Array.isArray(data.applications) && data.applications.length >= 4);
  assert.ok(Array.isArray(data.alerts) && data.alerts.length >= 3);
  assert.ok(Array.isArray(data.auditTrail) && data.auditTrail.length >= 4);
});

test("demo assets are captured from the real Vite frontend instead of a static preview", () => {
  const script = read("scripts/generate-demo-assets.mjs");

  assert.match(script, /Fetch\.enable/);
  assert.match(script, /mockApiResponse/);
  assert.match(script, /\/cluster\/ns\/easy\/pods/);
  assert.match(script, /\/cluster\/apps\/dashboard/);
  assert.match(script, /\/cluster\/baota\/ingress/);
  assert.match(script, /npm/);
  assert.match(script, /dev/);
  assert.doesNotMatch(script, /\/demo\/screenshots\//);
  assert.doesNotMatch(script, /preview\.html/);
  assert.equal(existsSync(resolve(root, "docs/demo/preview.html")), false);
});
