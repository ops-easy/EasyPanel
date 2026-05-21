import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function walk(dir) {
  return readdirSync(dir)
    .flatMap((name) => {
      const full = join(dir, name);
      const stat = statSync(full);
      if (stat.isDirectory()) return walk(full);
      return full;
    })
    .filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
}

test("AI inspect frontend uses the generic AI provider API", () => {
  const home = read("src/features/ops/ai-inspect/pages/AiInspectHome.tsx");
  const dashboard = read("src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx");
  const hub = read("src/pages/HomeHub.tsx");

  for (const [name, src] of [
    ["AiInspectHome", home],
    ["AiInspectDashboard", dashboard],
    ["HomeHub", hub],
  ]) {
    assert.match(src, /\/api\/ops\/ai-provider/, `${name} should read the AI provider endpoint`);
    assert.doesNotMatch(src, /\/api\/ops\/openclaw/, `${name} must not call the removed OpenClaw inspect endpoint`);
  }

  assert.match(home, /value="openclaw"/, "provider selector should include OpenClaw");
  assert.match(home, /value="hermes"/, "provider selector should include Hermes");
  assert.match(home, /providerProfiles/, "role overrides should use providerProfiles");
});

test("VictoriaLogs AI analysis uses provider-neutral routes", () => {
  const details = read("src/features/ops/ai-inspect/pages/AiInspectLogDetails.tsx");
  assert.match(details, /\/api\/ops\/vmlog\/ai-analyze/);
  assert.match(details, /\/api\/ops\/vmlog\/ai-analyze-row/);
  assert.doesNotMatch(details, /openclaw-analyze/);
});

test("removed OpenClaw inspect API paths do not remain in runtime source", () => {
  const offenders = [];
  for (const file of walk(join(root, "src"))) {
    const src = readFileSync(file, "utf8");
    if (/\/api\/ops\/openclaw|\/api\/ops\/vmlog\/openclaw-analyze/.test(src)) {
      offenders.push(file.replace(`${root}\\`, "").replace(/\\/g, "/"));
    }
  }
  assert.deepEqual(offenders, []);
});

test("AI inspect visible copy does not describe generic provider features as OpenClaw-only", () => {
  const checkedFiles = [
    "src/features/ops/ai-inspect/pages/AiInspectDashboard.tsx",
    "src/features/ops/ai-inspect/pages/AiInspectHome.tsx",
    "src/features/ops/ai-inspect/pages/AiInspectLogs.tsx",
    "src/features/ops/ai-inspect/pages/AiInspectLogDetails.tsx",
    "src/features/ops/ai-inspect/pages/AiInspectReports.tsx",
    "src/pages/HomeHub.tsx",
  ];
  const bannedCopy = [
    /OpenClaw 巡检/,
    /巡检 OpenClaw/,
    /AI 巡检 OpenClaw/,
    /OpenClaw 日志分析/,
    /OpenClaw 配置/,
    /OpenClaw 与定时巡检/,
    /OpenClaw \/ 对话接口/,
    /分场景 OpenClaw/,
    /远端 OpenClaw/,
  ];
  const offenders = [];

  for (const file of checkedFiles) {
    const src = read(file);
    for (const pattern of bannedCopy) {
      if (pattern.test(src)) {
        offenders.push(`${file}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
