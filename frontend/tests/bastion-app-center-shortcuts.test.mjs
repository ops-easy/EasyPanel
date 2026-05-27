import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("bastion app-center shortcuts include MySQL SQL console beside Redis", () => {
  const source = read("../src/features/vcenter/pages/VCenterBastion.tsx");
  assert.match(source, /MySQLSqlConsoleSheet/);
  assert.match(source, /mysqlSheetId/);
  assert.match(source, /bastion-sidebar-mysql/);
  assert.match(source, /\/api\/app-center\/mysql\/instances/);
  assert.match(source, /setMySQLSheetId\(r\.id\)/);
  assert.match(source, /SQL/);
});

test("MySQL SQL console sheet uses the existing app-center query endpoint", () => {
  const source = read("../src/features/app-center/mysql/components/MySQLSqlConsoleSheet.tsx");
  assert.match(source, /\/api\/app-center\/mysql\/instances\/\$\{instanceId\}\/query/);
  assert.match(source, /confirmMutation/);
  assert.match(source, /\/api\/app-center\/mysql\/instances\/\$\{instanceId\}\/schemas/);
});
