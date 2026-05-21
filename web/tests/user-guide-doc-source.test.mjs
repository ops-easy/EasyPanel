import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const guideSheetSource = read("../src/shared/layout/UserGuideSheet.tsx");
const editorSource = read("../src/md-editor/EditorContainer.tsx");
const listSource = read("../src/md-editor/DocumentsList.tsx");
const routesSource = read("../src/app/routes/docs-routes.tsx");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");

test("floating user guide is loaded from contextual document guide API", () => {
  assert.ok(guideSheetSource.includes("/api/docs/guides/resolve?path="));
  assert.ok(guideSheetSource.includes("encodeURIComponent(routePath)"));
  assert.ok(guideSheetSource.includes("OpenClawChatMarkdown"));
  assert.ok(guideSheetSource.includes("/docs/guides/doc/${doc.id}"));

  assert.doesNotMatch(guideSheetSource, /function\s+DocBody/);
  assert.doesNotMatch(guideSheetSource, /function\s+DocToc/);
  assert.doesNotMatch(guideSheetSource, /PlatformArchitectureDiagram/);
});

test("document center separates regular docs from system page guides", () => {
  assert.ok(editorSource.includes("const docsScope = isGuideMode ? \"guides\" : \"regular\""));
  assert.ok(editorSource.includes("/api/docs?scope=${docsScope}"));
  assert.ok(editorSource.includes("mode={isGuideMode ? \"guides\" : \"regular\"}"));
  assert.ok(editorSource.includes("allowDelete={!isGuideMode}"));

  assert.ok(listSource.includes("\u9875\u9762\u6307\u5357"));
  assert.ok(routesSource.includes('withBase(basePath, "guides")'));
  assert.ok(routesSource.includes('withBase(basePath, "guides/doc/:docId")'));
  assert.ok(sidebarSource.includes("/docs/guides"));
});
