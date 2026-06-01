import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");

test("Vite dev proxy does not capture SPA routes that merely start with /d or /r", () => {
  assert.doesNotMatch(viteConfig, /["']\/d["']\s*:/);
  assert.doesNotMatch(viteConfig, /["']\/r["']\s*:/);
  assert.match(viteConfig, /["']\^\/d\(\?:\/\|\$\)["']\s*:/);
  assert.match(viteConfig, /["']\^\/r\(\?:\/\|\$\)["']\s*:/);
});
