import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const vcenterSettingsSource = read("../src/features/vcenter/pages/VCenterSettings.tsx");
const pveWorkspaceSource = read("../src/features/compute/pve/pages/PveWorkspace.tsx");

test("vCenter settings uses the shared full content width", () => {
  assert.match(vcenterSettingsSource, /<div className="mx-auto w-full space-y-8 pb-12">/);
  assert.doesNotMatch(vcenterSettingsSource, /max-w-4xl/);
});

test("PVE write controls align with compute rw permission", () => {
  assert.match(pveWorkspaceSource, /status\?\.permissions\?\.compute === "rw"/);
});

test("PVE target form uses username and password instead of token fields", () => {
  assert.match(pveWorkspaceSource, /desc:\s*"维护 Proxmox VE 账号密码、Prometheus job 与 TLS 选项/);
  assert.match(pveWorkspaceSource, /<Label>用户名<\/Label>/);
  assert.match(pveWorkspaceSource, /<Label>密码<\/Label>/);
  assert.match(pveWorkspaceSource, /username:\s*"root"/);
  assert.match(pveWorkspaceSource, /password:\s*""/);
  assert.match(pveWorkspaceSource, /placeholder="root"/);
  assert.doesNotMatch(pveWorkspaceSource, /placeholder="root@pam"/);
  assert.doesNotMatch(pveWorkspaceSource, /<Label>Token ID<\/Label>/);
  assert.doesNotMatch(pveWorkspaceSource, /<Label>Token Secret<\/Label>/);
});
