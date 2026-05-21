import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("Markdown editor uses the local limited highlight plugin", () => {
  const pane = readFileSync(new URL("../src/md-editor/MarkdownEditorPane.tsx", import.meta.url), "utf8");
  const plugin = readFileSync(new URL("../src/md-editor/plugins/limitedHighlight.ts", import.meta.url), "utf8");

  assert.equal(pane.includes("@bytemd/plugin-highlight"), false);
  assert.match(pane, /limitedHighlight\(\)/);
  assert.match(plugin, /highlight\.js\/lib\/core/);
  assert.equal(plugin.includes('import("highlight.js")'), false);
  assert.equal(plugin.includes('import hljs from "highlight.js"'), false);
});

test("built markdown assets do not include the full highlight.js entry", { skip: !existsSync(new URL("../dist", import.meta.url)) }, () => {
  const assetsDir = new URL("../dist/assets/", import.meta.url);
  const jsAssets = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  const combined = jsAssets.map((name) => readFileSync(new URL(name, assetsDir), "utf8")).join("\n");

  assert.equal(combined.includes('import("highlight.js")'), false);
  assert.equal(combined.includes("@bytemd/plugin-highlight"), false);
  assert.equal(combined.includes("highlight.js/lib/languages/1c"), false);
});
