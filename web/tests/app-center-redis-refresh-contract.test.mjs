import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("Redis app center header exposes an overview refresh action", () => {
  const source = read("../src/features/app-center/redis/pages/AppCenterRedis.tsx");

  assert.match(source, /const refreshOverview = \(\) => \{/);
  assert.match(source, /void configQ\.refetch\(\);/);
  assert.match(source, /void statusQ\.refetch\(\);/);
  assert.match(source, /void listQ\.refetch\(\);/);
  assert.match(source, /onClick=\{refreshOverview\}[\s\S]*<RefreshCw[\s\S]*刷新/);
});
