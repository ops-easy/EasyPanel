import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("App entry only imports route islands, not route implementation modules", () => {
  assert.equal(appSource.includes("@/app/routes/"), false);
  assert.match(appSource, /@\/app\/route-islands\/AccountRoutesIsland/);
  assert.match(appSource, /@\/app\/route-islands\/DocsRoutesIsland/);
  assert.match(appSource, /@\/app\/route-islands\/ClusterRoutesIsland/);
});

test("App keeps first-session pages at the root shell", () => {
  assert.match(appSource, /@\/pages\/HomeHub/);
  assert.match(appSource, /@\/pages\/Login/);
  assert.match(appSource, /@\/pages\/Setup/);
});
