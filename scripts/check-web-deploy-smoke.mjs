#!/usr/bin/env node

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const webRoot = path.join(repoRoot, "web");
const distDir = path.join(webRoot, "dist");
const indexPath = path.join(distDir, "index.html");
const nginxConfigPath = path.join(webRoot, "deploy", "nginx.conf");
const helmNginxConfigPath = path.join(
  repoRoot,
  "k8s",
  "charts",
  "kube-bt-sync",
  "templates",
  "frontend-configmap.yaml",
);
const spaSmokeRoutes = [
  "/",
  "/cluster/apps/dashboard",
  "/docs/guides/doc/1",
  "/cluster/compute/pve/dashboard",
  "/cluster/compute/pve/targets",
  "/cluster/network/openwrt/dashboard",
];

function read(file) {
  return readFileSync(file, "utf8");
}

function assertNginxContract(label, source) {
  for (const location of ["/api/", "/r/", "/d/"]) {
    assert.match(source, new RegExp(`location\\s+${location.replaceAll("/", "\\/")}\\s*\\{`), `${label} missing ${location}`);
    assert.match(source, /proxy_pass\s+http:\/\//, `${label} ${location} must proxy to backend service`);
    assert.match(source, /proxy_set_header\s+X-Forwarded-Proto\s+\$scheme;/, `${label} must forward original proto`);
  }

  assert.match(source, /location\s+=\s+\/healthz\s*\{[\s\S]*return\s+200\s+"ok\\n";/, `${label} missing healthz`);
  assert.match(source, /location\s+\/\s*\{[\s\S]*try_files\s+\$uri\s+\$uri\/\s+\/index\.html;/, `${label} missing SPA fallback`);
}

function parseDistAssets(html) {
  return [
    ...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g),
  ].map((match) => match[1]);
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
    const filePath = insideDist && existsSync(requested) && statSync(requested).isFile() ? requested : indexPath;

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
  throw new Error("web/dist/index.html not found. Run npm run build before npm run check:deploy.");
}

const indexHtml = read(indexPath);
const assets = parseDistAssets(indexHtml);
assert.ok(assets.some((asset) => asset.endsWith(".js")), "dist/index.html must reference at least one JS asset");
for (const asset of assets) {
  assert.ok(existsSync(path.join(distDir, "assets", asset)), `dist asset missing: ${asset}`);
}

assertNginxContract("web/deploy/nginx.conf", read(nginxConfigPath));
assertNginxContract("Helm frontend ConfigMap", read(helmNginxConfigPath));

await withStaticServer(async (baseUrl) => {
  for (const route of spaSmokeRoutes) {
    const res = await fetch(`${baseUrl}${route}`);
    assert.equal(res.status, 200, `${route} should return 200`);
    const body = await res.text();
    assert.match(body, /<div id="root"><\/div>/, `${route} should return SPA index.html`);
  }

  const firstJs = assets.find((asset) => asset.endsWith(".js"));
  const jsRes = await fetch(`${baseUrl}/assets/${firstJs}`);
  assert.equal(jsRes.status, 200, `asset ${firstJs} should return 200`);
  assert.match(jsRes.headers.get("content-type") ?? "", /javascript/);
});

console.log(`web deploy smoke ok: assets=${assets.length}, spaFallback=${spaSmokeRoutes.length}, nginx=/api,/r,/d`);
