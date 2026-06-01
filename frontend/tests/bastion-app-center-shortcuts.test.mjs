import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("bastion console home summarizes MySQL SQL console beside Redis", () => {
  const source = read("../src/features/bastion/pages/BastionConsoleHome.tsx");
  assert.match(source, /queryKey: \["bastion-console-mysql"\]/);
  assert.match(source, /\/api\/app-center\/mysql\/instances/);
  assert.match(source, /Redis CLI 与 MySQL SQL/);
  assert.match(source, /应用中心 · MySQL/);
  assert.match(source, /MySQL SQL：使用实例连接信息，不走 SSH 凭据/);
  assert.match(source, /打开 MySQL/);
  assert.match(source, /to="\/cluster\/apps\/mysql"/);
});

test("bastion app-center shortcuts include MySQL SQL console beside Redis", () => {
  const source = read("../src/features/vcenter/pages/VCenterBastion.tsx");
  assert.match(source, /MySQLSqlConsoleSheet/);
  assert.match(source, /mysqlSheetId/);
  assert.match(source, /bastion-sidebar-mysql/);
  assert.match(source, /\/api\/app-center\/mysql\/instances/);
  assert.match(source, /setMySQLSheetId\(r\.id\)/);
  assert.match(source, /SQL/);
});

test("MySQL SQL console sheet uses the same WebSocket terminal style as Redis", () => {
  const source = read("../src/features/app-center/mysql/components/MySQLSqlConsoleSheet.tsx");
  assert.match(source, /@xterm\/xterm/);
  assert.match(source, /PlatformRelayBanner/);
  assert.match(source, /wsUrlForApiPath/);
  assert.match(source, /\/api\/app-center\/mysql\/instances\/\$\{encodeURIComponent\(String\(instanceId\)\)\}\/mysql-cli\/ws/);
  assert.doesNotMatch(source, /confirmMutation/);
  assert.doesNotMatch(source, /\/api\/app-center\/mysql\/instances\/\$\{instanceId\}\/query/);
});
