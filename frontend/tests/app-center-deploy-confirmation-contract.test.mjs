import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "../src");

function read(rel) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function collectApiCalls(text, marker) {
  const lines = text.split(/\r?\n/);
  const calls = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(marker)) continue;
    let start = i;
    while (start > 0 && !/apiPostJson/.test(lines[start])) {
      start -= 1;
      if (i - start > 40) break;
    }
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes(");")) {
      end += 1;
      if (end - i > 60) break;
    }
    const call = lines.slice(start, end + 1).join("\n");
    if (/apiPostJson/.test(call)) calls.push(call);
  }
  return calls;
}

function assertDeployCallCarriesConfirm(source, marker) {
  const calls = collectApiCalls(source, marker);
  assert.ok(calls.length > 0, `expected deploy call containing ${marker}`);
  for (const call of calls) {
    assert.match(
      call,
      /withAppCenterMutationConfirmQuery\(|confirm=true/,
      `app-center deploy call must carry confirm:\n${call}`
    );
  }
}

test("App Center deploy-to-cluster calls carry explicit confirmation", () => {
  const cases = [
    {
      source: read("features/app-center/redis/pages/AppCenterRedis.tsx"),
      marker: "/api/app-center/redis/k8s-deploy",
    },
    {
      source: read("features/app-center/mysql/pages/AppCenterMySQL.tsx"),
      marker: "/api/app-center/mysql/k8s-deploy",
    },
    {
      source: read("features/app-center/kafka/pages/AppCenterKafka.tsx"),
      marker: "/api/app-center/kafka/k8s-deploy",
    },
    {
      source: read("features/app-center/opensearch/pages/AppCenterOpenSearch.tsx"),
      marker: "/api/app-center/opensearch/k8s-deploy",
    },
    {
      source: read("features/app-center/hermes/pages/AppCenterHermes.tsx"),
      marker: "/api/app-center/hermes/k8s-deploy",
    },
    {
      source: read("features/app-center/openclaw/pages/AppCenterOpenClaw.tsx"),
      marker: "/api/app-center/openclaw/k8s-deploy",
    },
  ];

  for (const { source, marker } of cases) {
    assert.match(source, /from "@\/features\/app-center\/lib\/appCenterMutationConfirm"/);
    assertDeployCallCarriesConfirm(source, marker);
  }
});
