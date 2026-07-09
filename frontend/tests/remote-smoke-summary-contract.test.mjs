import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const frontendDir = path.join(repoRoot, "frontend");

const readonlyKeys = ["vcenter", "pve", "openwrt", "ikuai", "prometheus", "victoriaLogs"];

function spaIndex() {
  return [
    "<!doctype html>",
    '<html><head><link rel="stylesheet" href="/assets/index.css"></head>',
    '<body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>',
  ].join("");
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function sendJson(res, statusCode, payload) {
  send(res, statusCode, JSON.stringify(payload), { "content-type": "application/json" });
}

function readinessPayload({ badReadinessKey = "" } = {}) {
  return {
    systemCheck: {
      checks: Object.fromEntries(
        readonlyKeys.map((key) => [
          key,
          {
            status: key === badReadinessKey ? "error" : "readonly_reachable",
            configured: true,
            reachable: true,
            readonly: true,
          },
        ])
      ),
      baota: { status: "readonly_reachable" },
    },
  };
}

async function withSmokeServer(options, callback) {
  const requests = [];
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    requests.push(pathname);

    if (options.failPath === pathname) {
      send(res, options.failStatusCode ?? 503, "forced smoke failure");
      return;
    }

    if (pathname.startsWith("/assets/")) {
      send(res, 200, pathname.endsWith(".css") ? "body{}" : "console.log('asset ok')", {
        "content-type": pathname.endsWith(".css") ? "text/css" : "application/javascript",
      });
      return;
    }

    if (pathname === "/api/login/public-status" || pathname === "/api/runtime/status") {
      sendJson(res, 200, readinessPayload(options));
      return;
    }

    if (pathname === "/api/setup/status" || pathname === "/api/auth/status") {
      sendJson(res, 200, { ok: true });
      return;
    }

    send(res, 200, spaIndex(), { "content-type": "text/html" });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

async function withSummaryDir(callback) {
  const dir = await mkdtemp(path.join(tmpdir(), "easypanel-smoke-summary-"));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runScript(script, args, env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: frontendDir,
    env: {
      ...process.env,
      EASYPANEL_RENDER_SMOKE_ROUTE: "",
      SMOKE_AUTH_COOKIE: "",
      SMOKE_BEARER_TOKEN: "",
      SMOKE_D_PATH: "none",
      SMOKE_R_PATH: "none",
      SMOKE_READINESS_CHECKS: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });

  return { exitCode, stdout, stderr };
}

function parseConsoleSummaries(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("SMOKE_SUMMARY_JSON "))
    .map((line) => JSON.parse(line.slice("SMOKE_SUMMARY_JSON ".length)));
}

async function readSummaryFile(dir, fileName) {
  return JSON.parse(await readFile(path.join(dir, fileName), "utf8"));
}

test("deploy smoke emits machine-readable success summary without changing default ok output", async () => {
  await withSmokeServer({}, async (baseUrl, requests) => {
    await withSummaryDir(async (summaryDir) => {
      const result = await runScript("../scripts/smoke-deploy.mjs", ["--base-url", baseUrl], {
        SMOKE_SUMMARY_DIR: summaryDir,
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /frontend deploy smoke ok: base=http:\/\/127\.0\.0\.1:\d+/);

      const [summary] = parseConsoleSummaries(result.stdout).filter((item) => item.script === "smoke-deploy");
      assert.equal(summary.status, "passed");
      assert.equal(summary.baseUrl, baseUrl);
      assert.equal(summary.exitCode, 0);
      assert.deepEqual(summary.failedItems, []);
      assert.deepEqual(summary.readonlyChecks, []);
      assert.ok(summary.smokeRoutes.some((item) => item.path === "/cluster/apps/mysql" && item.statusCode === 200));
      assert.ok(requests.includes("/cluster/apps/mysql"));

      const fileSummary = await readSummaryFile(summaryDir, "smoke-deploy-summary.json");
      assert.deepEqual(fileSummary, summary);
    });
  });
});

test("deploy smoke emits failure summary with status code while preserving nonzero exit", async () => {
  await withSmokeServer({ failPath: "/cluster/apps/mysql", failStatusCode: 503 }, async (baseUrl) => {
    await withSummaryDir(async (summaryDir) => {
      const result = await runScript("../scripts/smoke-deploy.mjs", ["--base-url", baseUrl], {
        SMOKE_SUMMARY_DIR: summaryDir,
      });

      assert.notEqual(result.exitCode, 0);
      assert.doesNotMatch(result.stdout, /frontend deploy smoke ok:/);

      const [summary] = parseConsoleSummaries(result.stdout).filter((item) => item.script === "smoke-deploy");
      assert.equal(summary.status, "failed");
      assert.equal(summary.exitCode, 1);
      assert.ok(
        summary.failedItems.some(
          (item) => item.kind === "smokeRoute" && item.path === "/cluster/apps/mysql" && item.statusCode === 503
        )
      );

      const fileSummary = await readSummaryFile(summaryDir, "smoke-deploy-summary.json");
      assert.deepEqual(fileSummary, summary);
    });
  });
});

test("readonly readiness smoke emits route and check summary without changing default ok output", async () => {
  await withSmokeServer({}, async (baseUrl) => {
    await withSummaryDir(async (summaryDir) => {
      const result = await runScript("../scripts/smoke-readonly-readiness.mjs", ["--base-url", baseUrl], {
        SMOKE_SUMMARY_DIR: summaryDir,
      });

      assert.equal(result.exitCode, 0, result.stderr);
      assert.match(result.stdout, /readonly readiness smoke ok: base=http:\/\/127\.0\.0\.1:\d+/);

      const [summary] = parseConsoleSummaries(result.stdout).filter(
        (item) => item.script === "smoke-readonly-readiness"
      );
      assert.equal(summary.status, "passed");
      assert.equal(summary.baseUrl, baseUrl);
      assert.equal(summary.exitCode, 0);
      assert.deepEqual(summary.failedItems, []);
      assert.ok(summary.smokeRoutes.some((item) => item.path === "/cluster/ai-inspect/dashboard"));
      assert.ok(
        summary.readonlyChecks.some(
          (item) =>
            item.endpoint === "/api/login/public-status" &&
            item.key === "vcenter" &&
            item.status === "readonly_reachable" &&
            item.statusCode === 200
        )
      );

      const fileSummary = await readSummaryFile(summaryDir, "smoke-readonly-readiness-summary.json");
      assert.deepEqual(fileSummary, summary);
    });
  });
});

test("readonly readiness smoke emits failed check summary with status code while preserving nonzero exit", async () => {
  await withSmokeServer({ badReadinessKey: "pve" }, async (baseUrl) => {
    await withSummaryDir(async (summaryDir) => {
      const result = await runScript("../scripts/smoke-readonly-readiness.mjs", ["--base-url", baseUrl], {
        SMOKE_SUMMARY_DIR: summaryDir,
      });

      assert.notEqual(result.exitCode, 0);
      assert.doesNotMatch(result.stdout, /readonly readiness smoke ok:/);

      const [summary] = parseConsoleSummaries(result.stdout).filter(
        (item) => item.script === "smoke-readonly-readiness"
      );
      assert.equal(summary.status, "failed");
      assert.equal(summary.exitCode, 1);
      assert.ok(
        summary.failedItems.some(
          (item) =>
            item.kind === "readonlyCheck" &&
            item.endpoint === "/api/login/public-status" &&
            item.key === "pve" &&
            item.statusCode === 200
        )
      );

      const fileSummary = await readSummaryFile(summaryDir, "smoke-readonly-readiness-summary.json");
      assert.deepEqual(fileSummary, summary);
    });
  });
});
