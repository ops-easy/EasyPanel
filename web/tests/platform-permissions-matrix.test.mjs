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

const workspaceKeys = ["kubernetes", "compute", "network", "baota", "appcenter", "bastion", "aiinspect", "docs"];

test("admin sees enabled workspaces unless a menu entry explicitly hides them", () => {
  for (const key of workspaceKeys) {
    assert.equal(permissions.workspaceMenuVisible(null, key, "admin"), true, `${key} should be visible by default`);
  }

  assert.equal(permissions.workspaceMenuVisible({ menu: { appcenter: false } }, "appcenter", "admin"), false);
  assert.equal(permissions.workspaceMenuVisible({ menu: { vcenter_bastion: false } }, "bastion", "admin"), false);
  assert.equal(permissions.workspaceMenuVisible({ menu: { aiInspect: false } }, "aiinspect", "admin"), false);
});

test("viewer fallback read modules keep navigation visible but not write helpers", () => {
  const p = {
    legacyViewer: true,
    k8s: "ro",
    compute: "ro",
    network: "ro",
    baota: "ro",
    appcenter: "ro",
    appcenterRedis: "full",
  };

  for (const key of workspaceKeys) {
    assert.equal(permissions.workspaceMenuVisible(p, key, "viewer"), true, `${key} should follow legacy fallback`);
  }
  assert.equal(permissions.redisAppCenterCanWrite("viewer", p), false);
  assert.equal(permissions.cloudVmAppCenterCanWrite("viewer", p), false);
  assert.equal(permissions.k8sPodExecAllowed("viewer", p), false);
  assert.equal(permissions.k8sPodDeleteAllowed("viewer", p), false);
});

test("custom viewer explicit menu allows and denies are honored consistently", () => {
  const p = {
    legacyViewer: false,
    k8s: "none",
    compute: "ro",
    network: "none",
    baota: "none",
    appcenter: "rw",
    appcenterRedis: "readonly",
    menu: {
      kubernetes: false,
      network: true,
      appcenter: false,
      docs: true,
    },
  };

  assert.equal(permissions.workspaceMenuVisible(p, "kubernetes", "viewer"), false);
  assert.equal(permissions.workspaceMenuVisible(p, "compute", "viewer"), true);
  assert.equal(permissions.workspaceMenuVisible(p, "network", "viewer"), true);
  assert.equal(permissions.workspaceMenuVisible(p, "appcenter", "viewer"), false);
  assert.equal(permissions.workspaceMenuVisible(p, "docs", "viewer"), true);
  assert.equal(permissions.redisAppCenterCanWrite("viewer", p), false);
});

test("write helpers require backend write sub-permission semantics", () => {
  assert.equal(
    permissions.redisAppCenterCanWrite("viewer", { legacyViewer: false, appcenter: "rw", appcenterRedis: "full" }),
    true,
  );
  assert.equal(
    permissions.redisAppCenterCanWrite("viewer", { legacyViewer: false, appcenter: "rw", appcenterRedis: "readonly" }),
    false,
  );
  assert.equal(
    permissions.cloudVmAppCenterCanWrite("viewer", {
      legacyViewer: false,
      appcenter: "rw",
      appcenterRedis: "full",
      appcenterCloudVm: "managed_only",
    }),
    false,
  );
  assert.equal(
    permissions.k8sPodExecAllowed("viewer", { legacyViewer: false, k8s: "rw", k8sPodExec: true }),
    true,
  );
  assert.equal(
    permissions.k8sPodDeleteAllowed("viewer", { legacyViewer: false, k8s: "rw", k8sPodDelete: false }),
    false,
  );
});

test("home dashboard cards and sidebar use the same workspace gate helper", () => {
  const homeHub = readFileSync(new URL("../src/pages/HomeHub.tsx", import.meta.url), "utf8");
  const sidebar = readFileSync(new URL("../src/shared/layout/Sidebar.tsx", import.meta.url), "utf8");

  for (const key of workspaceKeys) {
    assert.match(homeHub, new RegExp(`workspaceMenuVisible\\(perm, "${key}"`), `HomeHub missing ${key} gate`);
    assert.match(sidebar, new RegExp(`workspaceMenuVisible\\(perm, "${key}"`), `Sidebar missing ${key} gate`);
  }
});
