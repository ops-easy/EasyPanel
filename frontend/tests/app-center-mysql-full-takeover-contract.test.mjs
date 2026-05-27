import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("MySQL app center page exposes the full takeover surface", () => {
  const source = read("../src/features/app-center/mysql/pages/AppCenterMySQL.tsx");
  for (const needle of [
    "/api/app-center/mysql/instances",
    "/api/app-center/mysql/k8s-deploy",
    "/api/app-center/mysql/templates",
    "/runtime",
    "/processlist",
    "/query",
    "/mysql-cli/ws",
    "/users",
    "/backups",
    "confirmMutation",
  ]) {
    assert.ok(source.includes(needle), `missing ${needle}`);
  }
});

test("MySQL app center imports the reusable CLI terminal sheet", () => {
  const source = read("../src/features/app-center/mysql/pages/AppCenterMySQL.tsx");
  assert.match(source, /MySQLSqlConsoleSheet/);
  assert.match(source, /setCliSheetOpen/);
  assert.match(source, /mysql-cli/);
});

test("MySQL has a routed app-center entry", () => {
  const routes = read("../src/app/routes/app-center-routes.tsx");
  const nav = read("../src/features/app-center/layout/appCenterNavigation.ts");
  assert.match(routes, /AppCenterMySQL/);
  assert.match(routes, /path="mysql"/);
  assert.ok(nav.indexOf("/cluster/apps/redis") < nav.indexOf("/cluster/apps/mysql"));
  assert.ok(nav.indexOf("/cluster/apps/mysql") < nav.indexOf("/cluster/apps/kafka"));
});
