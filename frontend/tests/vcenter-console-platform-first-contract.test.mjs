import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const consolePanel = readFileSync(
  new URL("../src/features/vcenter/pages/VCenterConsolePanel.tsx", import.meta.url),
  "utf8"
);

test("vCenter console panel keeps the in-platform WebMKS console as the primary path", () => {
  assert.match(consolePanel, /from "react-router-dom"/);
  assert.match(consolePanel, /const platformConsolePath = `\/cluster\/bastion\/console\/\$\{encodeURIComponent\(moref\)\}`;/);
  assert.match(consolePanel, /<Link to=\{platformConsolePath\}>打开站内 WebMKS 控制台<\/Link>/);
  assert.match(consolePanel, /站内 WebMKS 控制台/);
  assert.doesNotMatch(consolePanel, /推荐：vSphere 官方网页控制台/);
  assert.doesNotMatch(consolePanel, /请一律使用下方/);
  assert.doesNotMatch(consolePanel, /window\.open/);
});
