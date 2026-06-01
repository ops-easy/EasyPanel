import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const appSource = read("../src/App.tsx");
const boundarySource = read("../src/app/shell/AppRouteBoundary.tsx");

test("route error boundary resets when the browser location changes", () => {
  assert.match(appSource, /useLocation/);
  assert.match(appSource, /<AppRouteBoundary\s+resetKey=\{location\.pathname\}/);
  assert.match(boundarySource, /resetKey:\s*string/);
  assert.match(boundarySource, /componentDidUpdate/);
  assert.match(boundarySource, /prevProps\.resetKey\s*!==\s*this\.props\.resetKey/);
});

test("route error boundary has polished in-app recovery actions", () => {
  assert.match(boundarySource, /role="alert"/);
  assert.match(boundarySource, /返回工作台/);
  assert.match(boundarySource, /复制错误信息/);
  assert.match(boundarySource, /<Link\s+to="\/"/);
  assert.match(boundarySource, /AlertTriangle/);
  assert.match(boundarySource, /RefreshCw/);
  assert.doesNotMatch(boundarySource, /rounded-xl border border-red-200 bg-red-50/);
});
