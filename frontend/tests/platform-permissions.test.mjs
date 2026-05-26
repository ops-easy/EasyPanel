import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/platform-permissions.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const permissions = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

test("module visibility follows compute and network fallbacks", () => {
  assert.equal(permissions.moduleVisible(undefined, "k8s"), true);
  assert.equal(permissions.moduleVisible({ compute: "ro", vcenter: "none" }, "compute"), true);
  assert.equal(permissions.moduleVisible({ compute: "none", vcenter: "rw" }, "compute"), false);
  assert.equal(permissions.moduleVisible({ network: "rw", vcenter: "none" }, "network"), true);
  assert.equal(permissions.moduleVisible({ network: "none", vcenter: "rw" }, "network"), false);
});

test("menu visibility honors admin hides and custom viewer explicit allows", () => {
  assert.equal(permissions.menuItemVisible({ menu: { appcenter: false } }, "appcenter", "admin", true), false);
  assert.equal(permissions.menuItemVisible({ legacyViewer: true }, "appcenter", "viewer", true), true);
  assert.equal(
    permissions.menuItemVisible({ legacyViewer: false, menu: { appcenter: true } }, "appcenter", "viewer", false),
    true
  );
  assert.equal(
    permissions.menuItemVisible({ legacyViewer: false, menu: { appcenter: false } }, "appcenter", "viewer", true),
    false
  );
});

test("app center write helpers match backend sub-permission semantics", () => {
  assert.equal(permissions.redisAppCenterCanWrite("admin", null), true);
  assert.equal(permissions.redisAppCenterCanWrite("viewer", { legacyViewer: true }), false);
  assert.equal(permissions.redisAppCenterCanWrite("viewer", { legacyViewer: false, appcenter: "rw", appcenterRedis: "full" }), true);
  assert.equal(
    permissions.redisAppCenterCanWrite("viewer", { legacyViewer: false, appcenter: "rw", appcenterRedis: "readonly" }),
    false
  );
  assert.equal(
    permissions.cloudVmAppCenterCanWrite("viewer", {
      legacyViewer: false,
      appcenter: "rw",
      appcenterRedis: "full",
      appcenterCloudVm: "managed_only",
    }),
    false
  );
});
