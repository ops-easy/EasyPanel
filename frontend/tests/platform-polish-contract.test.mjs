import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function readSourceFiles(dirUrl) {
  const dir = fileURLToPath(dirUrl);
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...readSourceFiles(new URL(`${entry}/`, dirUrl)));
    } else if (/\.(tsx?|jsx?)$/.test(entry)) {
      files.push({ path: full, source: readFileSync(full, "utf8") });
    }
  }
  return files;
}

test("platform UI does not open management fallbacks through raw browser windows", () => {
  const offenders = readSourceFiles(root)
    .filter((file) => /window\.open/.test(file.source))
    .map((file) => file.path);

  assert.deepEqual(offenders, [], "fallback links should stay in-platform or be copy-only");

  const bastion = read("../src/features/vcenter/pages/VCenterBastion.tsx");
  assert.match(bastion, /navigator\.clipboard\.writeText\(effectiveRdpWebUrl\)/);
  assert.match(bastion, /复制备用链接/);
  assert.doesNotMatch(bastion, /新标签打开/);
});

test("Baota primary setup copy reads as configuration, not placeholder access setup", () => {
  const source = [
    read("../src/features/baota/components/BaotaSettingsWizard.tsx"),
    read("../src/features/baota/pages/BaotaDashboard.tsx"),
    read("../src/features/baota/pages/BaotaSettingsPage.tsx"),
    read("../src/features/baota/pages/BaotaSync.tsx"),
  ].join("\n");

  assert.doesNotMatch(source, /占位/);
  assert.doesNotMatch(source, /接入向导|面板接入|默认面板接入|才算接入|本页只维护宝塔接入/);
  assert.match(source, /宝塔配置向导/);
  assert.match(source, /面板配置/);
});

test("OpenClaw model setup avoids placeholder language for real deployment defaults", () => {
  const source = [
    read("../src/lib/openclaw-gateway-image.ts"),
    read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx"),
  ].join("\n");

  assert.doesNotMatch(source, /占位/);
  assert.match(source, /默认 Base URL 为/);
  assert.match(source, /按实际服务地址替换/);
});

test("primary operation surfaces avoid demo/access-era wording", () => {
  const homeHub = read("../src/pages/HomeHub.tsx");
  assert.doesNotMatch(homeHub, /已接入|当前已接入/);
  assert.match(homeHub, /已就绪/);
  assert.match(homeHub, /已配置/);

  const dashboard = read("../src/features/cluster/pages/ClusterK8sDashboardMonitoringSection.tsx");
  assert.doesNotMatch(dashboard, /登录演示/);
  assert.match(dashboard, /首次登录/);

  const redis = read("../src/features/app-center/redis/pages/AppCenterRedis.tsx");
  assert.doesNotMatch(redis, /集群外示例/);
  assert.match(redis, /集群外地址/);

  const kafka = read("../src/features/app-center/kafka/pages/AppCenterKafka.tsx");
  assert.doesNotMatch(kafka, /成员示例/);
  assert.match(kafka, /成员样本/);

  const openClaw = read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx");
  assert.doesNotMatch(openClaw, /外网访问示例/);
  assert.match(openClaw, /外网访问地址/);

  const login = read("../src/pages/Login.tsx");
  assert.doesNotMatch(login, /已接入|面板已接入|解析已接入/);
  assert.match(login, /已配置/);

  const networkMappers = read("../src/features/network/model/networkMappers.ts");
  assert.doesNotMatch(networkMappers, /已接入/);
  assert.match(networkMappers, /已配置/);

  const podRestartAi = read("../src/features/cluster/pages/PodRestartAiPanel.tsx");
  assert.doesNotMatch(podRestartAi, /若已接入 VL/);
  assert.match(podRestartAi, /若已配置 VL/);

  const appCenterBootstrapCopy = [
    read("../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx"),
    read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx"),
    read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx"),
    read("../src/features/app-center/openclaw/pages/AppCenterOpenClawDetail.tsx"),
  ].join("\n");
  assert.doesNotMatch(appCenterBootstrapCopy, /尚未完成首次引导/);
  assert.match(appCenterBootstrapCopy, /尚未配置部署/);
});
