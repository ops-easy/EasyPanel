import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("frontend nginx preserves browser host and port for websocket proxying", () => {
  const conf = fs.readFileSync(new URL("../deploy/nginx.conf", import.meta.url), "utf8");

  assert.match(conf, /location \/api\/[\s\S]*proxy_set_header Host \$http_host;/);
  assert.match(conf, /location \/api\/[\s\S]*proxy_set_header X-Forwarded-Host \$http_host;/);
});
