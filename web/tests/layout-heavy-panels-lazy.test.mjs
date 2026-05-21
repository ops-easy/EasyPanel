import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("layout defers guide and notification sheets from the entry chunk", () => {
  const appLayout = readFileSync(new URL("../src/shared/layout/AppLayout.tsx", import.meta.url), "utf8");
  const header = readFileSync(new URL("../src/shared/layout/Header.tsx", import.meta.url), "utf8");

  assert.equal(appLayout.includes('import UserGuideSheet from "./UserGuideSheet"'), false);
  assert.match(appLayout, /React\.lazy\(\(\) => import\("\.\/UserGuideSheet"\)\)/);
  assert.equal(header.includes('import HeaderNotificationsSheet from "@/shared/layout/HeaderNotificationsSheet"'), false);
  assert.match(header, /React\.lazy\(\(\) => import\("@\/shared\/layout\/HeaderNotificationsSheet"\)\)/);
});

test("vite config names heavyweight lazy vendor chunks", () => {
  const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  const expectedChunkNames = [
    "codemirror",
    "highlight-limited",
    "elkjs",
    "cytoscape",
  ];

  for (const chunkName of expectedChunkNames) {
    assert.ok(config.includes(`"${chunkName}"`), `missing manual chunk ${chunkName}`);
  }
});
