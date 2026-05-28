import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const shortcutCopy = [
  "快捷键",
  "Tab",
  "补全",
  "↑ / ↓",
  "历史",
  "Ctrl+A/E",
  "行首/行尾",
  "Ctrl+U",
  "清空当前行",
  "Ctrl+L",
  "清屏",
  "Ctrl+W",
  "删除光标前一个词",
];

test("MySQL terminal shortcut help stays with the mysql-cli entry", () => {
  const sheet = read("../src/features/app-center/mysql/components/MySQLSqlConsoleSheet.tsx");
  const page = read("../src/features/app-center/mysql/pages/AppCenterMySQL.tsx");

  for (const needle of shortcutCopy) {
    assert.ok(sheet.includes(needle), `missing MySQL shortcut copy: ${needle}`);
  }
  assert.match(sheet, /pod-exec-xterm-host/);
  assert.match(sheet, /wsUrlForApiPath/);
  assert.match(page, /<MySQLSqlConsoleSheet/);
  assert.match(page, /data-terminal-route="\/mysql-cli\/ws"/);
  assert.match(page, /onClick=\{\(\) => setCliSheetOpen\(true\)\}/);
  assert.match(page, /打开 mysql-cli/);
});

test("Redis terminal shortcut help stays with the redis-cli entry", () => {
  const sheet = read("../src/features/app-center/redis/components/RedisCliTerminalSheet.tsx");
  const page = read("../src/features/app-center/redis/pages/AppCenterRedis.tsx");

  for (const needle of shortcutCopy) {
    assert.ok(sheet.includes(needle), `missing Redis shortcut copy: ${needle}`);
  }
  assert.match(sheet, /pod-exec-xterm-host/);
  assert.match(sheet, /wsUrlForApiPath/);
  assert.match(page, /<RedisCliTerminalSheet/);
  assert.match(page, /<Terminal className="h-3\.5 w-3\.5" \/>[\s\S]*redis-cli/);
  assert.match(page, /setOpen\(true\)/);
});
