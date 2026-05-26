#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distDir = path.join(repoRoot, "frontend", "dist");
const htmlPath = path.join(distDir, "index.html");

const maxEntryKiB = 300;
const maxInitialJsKiB = 700;
const maxEditorShellKiB = 100;
const forbiddenInitialChunks = [
  /recharts/i,
  /xterm/i,
  /chart-ui/i,
  /codemirror/i,
  /bytemd/i,
  /katex/i,
  /mermaid/i,
  /highlight-limited/i,
  /OpenClawChatMarkdown/i,
  /HeaderNotificationsSheet/i,
  /UserGuideSheet/i,
  /EditorContainer/i,
  /elk(?:\.bundled|js)/i,
  /cytoscape/i,
  /subset-shared/i,
  /percentages/i,
];

function assetPath(assetName) {
  return path.join(distDir, "assets", assetName);
}

function sizeKiB(assetName) {
  return statSync(assetPath(assetName)).size / 1024;
}

function roundKiB(value) {
  return Math.round(value * 100) / 100;
}

function readAsset(assetName) {
  return readFileSync(assetPath(assetName), "utf8");
}

function findDistAssets(pattern) {
  const assetsDir = path.join(distDir, "assets");
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir).filter((name) => pattern.test(name));
}

function parseInitialAssets(html) {
  const entry = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="\/assets\/([^"]+\.js)"/)?.[1];
  const preloads = [...html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="\/assets\/([^"]+\.js)"/g)].map(
    (match) => match[1],
  );
  assert.ok(entry, "dist/index.html must contain a module script entry");
  return { entry, preloads };
}

function parseStaticImports(assetText) {
  return [...assetText.matchAll(/import[^;]+from"\.\/([^"]+\.js)";/g)].map((match) => match[1]);
}

function assertNoForbiddenInitialChunk(kind, assets) {
  for (const asset of assets) {
    const hit = forbiddenInitialChunks.find((pattern) => pattern.test(asset));
    assert.ok(!hit, `${kind} must not include heavy lazy chunk ${asset}`);
  }
}

if (!existsSync(htmlPath)) {
  throw new Error("frontend/dist/index.html not found. Run npm run build before npm run check:bundle.");
}

const html = readFileSync(htmlPath, "utf8");
const { entry, preloads } = parseInitialAssets(html);
const initialAssets = [entry, ...preloads];

for (const asset of initialAssets) {
  assert.ok(existsSync(assetPath(asset)), `initial asset missing from dist: ${asset}`);
}

const entryKiB = sizeKiB(entry);
const initialJsKiB = initialAssets.reduce((sum, asset) => sum + sizeKiB(asset), 0);
const staticImports = parseStaticImports(readAsset(entry));

assert.ok(entryKiB <= maxEntryKiB, `entry chunk is ${roundKiB(entryKiB)} KiB, budget is ${maxEntryKiB} KiB`);
assert.ok(
  initialJsKiB <= maxInitialJsKiB,
  `initial JS is ${roundKiB(initialJsKiB)} KiB, budget is ${maxInitialJsKiB} KiB`,
);
assertNoForbiddenInitialChunk("modulepreload", preloads);
assertNoForbiddenInitialChunk("entry static import", staticImports);

const editorShells = findDistAssets(/^EditorContainer-[\w-]+\.js$/);
assert.ok(editorShells.length > 0, "expected an EditorContainer route shell chunk in dist/assets");
for (const asset of editorShells) {
  const kib = sizeKiB(asset);
  assert.ok(
    kib <= maxEditorShellKiB,
    `EditorContainer shell ${asset} is ${roundKiB(kib)} KiB, budget is ${maxEditorShellKiB} KiB`,
  );
}

console.log(
  `bundle budget ok: entry=${roundKiB(entryKiB)} KiB, initialJs=${roundKiB(initialJsKiB)} KiB, preloads=${preloads.length}`,
);
