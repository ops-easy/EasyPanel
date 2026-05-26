import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("YamlEditor wrapper does not import CodeMirror directly", () => {
  const wrapper = readFileSync(new URL("../src/shared/ui/YamlEditor.tsx", import.meta.url), "utf8");
  assert.equal(wrapper.includes("@uiw/react-codemirror"), false);
  assert.equal(wrapper.includes("@codemirror/lang-yaml"), false);
  assert.match(wrapper, /lazy\(\(\) =>\s*import\("\.\/YamlEditorPane"\)/);
});

test("YamlEditorPane owns CodeMirror implementation", () => {
  const pane = readFileSync(new URL("../src/shared/ui/YamlEditorPane.tsx", import.meta.url), "utf8");
  assert.match(pane, /@uiw\/react-codemirror/);
  assert.match(pane, /@codemirror\/lang-yaml/);
});
