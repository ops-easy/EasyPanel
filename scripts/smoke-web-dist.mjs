#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const distDir = path.join(repoRoot, "frontend", "dist");
const indexPath = path.join(distDir, "index.html");
const fallbackRoutes = ["/docs", "/cluster", "/compute", "/network"];

function read(file) {
  return readFileSync(file, "utf8");
}

function parseAssets(html) {
  return [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((match) => match[1]);
}

function contentTypeFor(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

async function withStaticServer(callback) {
  const indexHtml = read(indexPath);
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname);
    const requested = path.normalize(path.join(distDir, pathname));
    const insideDist = requested === distDir || requested.startsWith(`${distDir}${path.sep}`);
    const isExistingFile = insideDist && existsSync(requested) && statSync(requested).isFile();

    if (pathname.startsWith("/assets/") && !isExistingFile) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    const filePath = isExistingFile ? requested : indexPath;
    res.setHeader("Content-Type", contentTypeFor(filePath));
    res.end(filePath === indexPath ? indexHtml : readFileSync(filePath));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object", "static smoke server did not bind");

  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

if (!existsSync(indexPath)) {
  throw new Error("frontend/dist/index.html not found. Run npm run build before npm run smoke:dist.");
}

const indexHtml = read(indexPath);
const assets = parseAssets(indexHtml);
const entryAsset = assets.find((asset) => asset.endsWith(".js"));

assert.ok(entryAsset, "dist/index.html must reference a JavaScript entry asset");
for (const asset of assets) {
  assert.ok(existsSync(path.join(distDir, "assets", asset)), `dist asset missing: ${asset}`);
}

await withStaticServer(async (baseUrl) => {
  const root = await fetch(`${baseUrl}/`);
  assert.equal(root.status, 200, "GET / should return 200");
  assert.match(await root.text(), /<div id="root"><\/div>/, "GET / should return SPA index.html");

  const entry = await fetch(`${baseUrl}/assets/${entryAsset}`);
  assert.equal(entry.status, 200, `GET /assets/${entryAsset} should return 200`);
  assert.match(entry.headers.get("content-type") ?? "", /javascript/, "entry asset must be JavaScript");

  for (const route of fallbackRoutes) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200, `${route} should return 200`);
    assert.match(await res.text(), /<div id="root"><\/div>/, `${route} should return SPA index.html`);
  }
});

console.log(`frontend dist smoke ok: entry=${entryAsset}, assets=${assets.length}, fallbacks=${fallbackRoutes.length}`);
