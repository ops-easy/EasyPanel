import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const globalSearchSource = read("../src/shared/layout/GlobalSearchBar.tsx");
const redisSource = read("../src/features/app-center/redis/pages/AppCenterRedis.tsx");
const mysqlSource = read("../src/features/app-center/mysql/pages/AppCenterMySQL.tsx");

test("global search queries app center instance lists", () => {
  for (const endpoint of [
    "/api/app-center/redis/instances",
    "/api/app-center/mysql/instances",
    "/api/app-center/kafka/instances",
    "/api/app-center/openclaw/instances",
    "/api/app-center/hermes/instances",
  ]) {
    assert.ok(globalSearchSource.includes(`"${endpoint}"`), `missing app center endpoint ${endpoint}`);
  }
});

test("global search app center hits carry module labels and detail/workspace targets", () => {
  for (const [kind, label] of [
    ["redis", "Redis"],
    ["mysql", "MySQL"],
    ["kafka", "Kafka"],
    ["openclaw", "OpenClaw"],
    ["hermes", "Hermes"],
  ]) {
    assert.match(globalSearchSource, new RegExp(`kind:\\s*"${kind}"`), `missing kind ${kind}`);
    assert.match(globalSearchSource, new RegExp(`moduleLabel:\\s*"${label}"`), `missing module label ${label}`);
  }

  assert.match(globalSearchSource, /\/cluster\/apps\/redis\?instance=\$\{encodeURIComponent\(String\(i\.id\)\)\}/);
  assert.match(globalSearchSource, /\/cluster\/apps\/mysql\?instance=\$\{encodeURIComponent\(String\(i\.id\)\)\}/);
  assert.match(globalSearchSource, /\/cluster\/apps\/kafka\/instance\/\$\{encodeURIComponent\(String\(i\.id\)\)\}/);
  assert.match(globalSearchSource, /\/cluster\/apps\/openclaw\/\$\{encodeURIComponent\(i\.id\)\}/);
  assert.match(globalSearchSource, /\/cluster\/apps\/hermes\/\$\{encodeURIComponent\(i\.id\)\}/);
  assert.match(globalSearchSource, /\{r\.moduleLabel\}/);
});

test("redis and mysql workspaces select an instance from the global search query parameter", () => {
  for (const [name, source] of [
    ["Redis", redisSource],
    ["MySQL", mysqlSource],
  ]) {
    assert.match(source, /useSearchParams/, `${name} workspace should read search params`);
    assert.match(source, /searchParams\.get\("instance"\)/, `${name} workspace should read instance query param`);
    assert.match(source, /setSelectedId\(requestedInstanceId\)/, `${name} workspace should select requested instance`);
  }
});

test("redis and mysql global-search jumps clear local filters before selecting", () => {
  for (const [name, source] of [
    ["Redis", redisSource],
    ["MySQL", mysqlSource],
  ]) {
    assert.match(source, /setSearchQ\(""\)/, `${name} workspace should clear the page search filter`);
  }
});
