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

test("配置集中呈现 vCenter、PVE、监控、SSH 与 VMLog 配置", () => {
  const settingsSource = read("../src/features/compute/pages/VirtualMachineSettings.tsx");

  assert.match(settingsSource, /TabsTrigger value="access"/);
  assert.match(settingsSource, /TabsTrigger value="monitoring"/);
  assert.match(settingsSource, /TabsTrigger value="remote"/);
  assert.match(settingsSource, /TabsTrigger value="security"/);
  assert.match(settingsSource, /TabsTrigger value="runtime"/);
  assert.match(settingsSource, /vCenter 连接/);
  assert.match(settingsSource, /PVE 接入/);
  assert.match(settingsSource, /监控数据源/);
  assert.match(settingsSource, /远程访问/);
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
