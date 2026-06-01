import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const url = (path) => new URL(path, import.meta.url);
const exists = (path) => existsSync(url(path));
const read = (path) => readFileSync(url(path), "utf8");

test("配置是算力侧一等路由，不再保留旧 vCenter 设置入口", () => {
  assert.equal(exists("../src/features/compute/pages/VirtualMachineSettings.tsx"), true);
  assert.equal(exists("../src/features/vcenter/pages/VCenterSettings.tsx"), false);

  const computeRoutesSource = read("../src/app/routes/compute-routes.tsx");
  const legacyVcenterRoutesSource = read("../src/app/routes/vcenter-routes.tsx");
  const routeInventorySource = read("../src/app/route-inventory.ts");

  assert.match(computeRoutesSource, /path="config"/);
  assert.match(computeRoutesSource, /path="vm-settings"[\s\S]*to="\/cluster\/compute\/config"/);
  assert.doesNotMatch(computeRoutesSource, /path="vcenter\/settings"/);
  assert.doesNotMatch(legacyVcenterRoutesSource, /vcenter\/settings/);
  assert.match(routeInventorySource, /"\/cluster\/compute\/config"/);
  assert.doesNotMatch(routeInventorySource, /"\/cluster\/compute\/vcenter\/settings"/);
});

test("配置集中呈现 vCenter、PVE、监控、iDRAC 与 VMLog 配置", () => {
  const settingsSource = read("../src/features/compute/pages/VirtualMachineSettings.tsx");

  assert.doesNotMatch(settingsSource, /TabsTrigger/);
  assert.match(settingsSource, /type SettingsConfigSection = "vcenter" \| "pve" \| "monitoring" \| "idrac" \| "vmlog"/);
  assert.match(settingsSource, /activeSection === card\.section/);
  assert.match(settingsSource, /<PveTargetSettingsPanel \/>/);
  assert.match(settingsSource, /focus="vcenter"/);
  assert.match(settingsSource, /focus="monitoring"/);
  assert.match(settingsSource, /focus="idrac"/);
  assert.match(settingsSource, /focus="vmlog"/);
  assert.match(settingsSource, /vCenter 连接/);
  assert.match(settingsSource, /PVE 目标/);
  assert.match(settingsSource, /监控数据源/);
  assert.match(settingsSource, /iDRAC 配置/);
  assert.match(settingsSource, /VMLog/);
});

test("PVE write controls align with compute rw permission", () => {
  const pveSettingsPanelSource = read("../src/features/compute/pve/components/PveTargetSettingsPanel.tsx");

  assert.match(pveSettingsPanelSource, /status\?\.permissions\?\.compute === "rw"/);
});

test("PVE target form uses username and password instead of token fields", () => {
  const pveTargetFormSource = read("../src/features/compute/pve/components/PveTargetForm.tsx");

  assert.match(pveTargetFormSource, /<Label>用户名<\/Label>/);
  assert.match(pveTargetFormSource, /<Label>密码<\/Label>/);
  assert.match(pveTargetFormSource, /username:\s*"root"/);
  assert.match(pveTargetFormSource, /password:\s*""/);
  assert.match(pveTargetFormSource, /placeholder="root"/);
  assert.doesNotMatch(pveTargetFormSource, /placeholder="root@pam"/);
  assert.doesNotMatch(pveTargetFormSource, /<Label>Token ID<\/Label>/);
  assert.doesNotMatch(pveTargetFormSource, /<Label>Token Secret<\/Label>/);
});

test("vCenter focused config uses a designed connection panel", () => {
  const runtimeSettingsSource = read("../src/features/settings/components/SettingsRuntimeSection.tsx");

  assert.match(runtimeSettingsSource, /连接身份/);
  assert.match(runtimeSettingsSource, /运行策略/);
  assert.match(runtimeSettingsSource, /访问地址/);
  assert.match(runtimeSettingsSource, /vcenterInsecure/);
  assert.match(runtimeSettingsSource, /vcenter-config-summary/);
  assert.doesNotMatch(runtimeSettingsSource, /<Label>vcenterUrl<\/Label>/);
});

test("PVE target settings uses summary-first layout instead of an empty table", () => {
  const pvePanelSource = read("../src/features/compute/pve/components/PveTargetSettingsPanel.tsx");
  const pveTargetFormSource = read("../src/features/compute/pve/components/PveTargetForm.tsx");

  assert.match(pvePanelSource, /当前 PVE 目标/);
  assert.match(pvePanelSource, /TargetSummaryItem/);
  assert.match(pvePanelSource, /target-summary-grid/);
  assert.match(pveTargetFormSource, /lg:grid-cols-12/);
  assert.match(pveTargetFormSource, /连接参数/);
  assert.doesNotMatch(pvePanelSource, /TableHeader/);
  assert.doesNotMatch(pvePanelSource, /还没有 PVE 目标/);
});
