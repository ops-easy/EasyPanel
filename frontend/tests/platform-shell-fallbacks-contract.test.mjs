import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("global not-found page uses the platform recovery surface", () => {
  const source = read("../src/pages/NotFound.tsx");

  assert.match(source, /SearchX/);
  assert.match(source, /返回工作台/);
  assert.match(source, /回到上一页/);
  assert.match(source, /Button/);
  assert.doesNotMatch(source, /min-h-screen items-center justify-center bg-gray-100/);
});

test("auth and permission guards render actionable platform fallbacks", () => {
  const requireAuth = read("../src/app/guards/RequireAuth.tsx");
  const viewerRedirect = read("../src/app/guards/ViewerRedirect.tsx");
  const source = `${requireAuth}\n${viewerRedirect}`;

  assert.match(source, /role="alert"/);
  assert.match(source, /重新检查/);
  assert.match(source, /返回安全入口/);
  assert.match(source, /AlertTriangle/);
  assert.match(source, /Loader2/);
  assert.doesNotMatch(source, /请确认后端已启动且可访问/);
  assert.doesNotMatch(source, /rounded-xl border border-amber-200 bg-amber-50/);
});

test("setup gate renders the same actionable shell fallback", () => {
  const source = read("../src/app/guards/SetupGate.tsx");

  assert.match(source, /role="alert"/);
  assert.match(source, /重新检查初始化状态/);
  assert.match(source, /AlertTriangle/);
  assert.match(source, /Loader2/);
  assert.doesNotMatch(source, /请确认后端已启动且可访问/);
});

test("lazy route fallback keeps a polished loading affordance", () => {
  const source = read("../src/app/route-fallback.tsx");

  assert.match(source, /Loader2/);
  assert.match(source, /加载模块中…/);
  assert.doesNotMatch(source, /加载模块中\.\.\./);
});
