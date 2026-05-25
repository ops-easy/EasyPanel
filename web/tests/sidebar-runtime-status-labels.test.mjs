import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sidebarSource = readFileSync(new URL("../src/shared/layout/Sidebar.tsx", import.meta.url), "utf8");

test("sidebar runtime status uses connected or unconfigured labels", () => {
  assert.match(sidebarSource, /"PVE 已连接"/);
  assert.match(sidebarSource, /"OpenWrt 已连接"/);
  assert.match(sidebarSource, /"宝塔 已连接"/);
  assert.match(sidebarSource, /DDNS: \{cfg\.ddnsHost \? "已连接" : "未配置"\}/);

  assert.doesNotMatch(sidebarSource, /`PVE \$\{pveTargetCount\} 目标`/);
  assert.doesNotMatch(sidebarSource, /`OpenWrt \$\{openWrtDeviceCount\} 设备`/);
  assert.doesNotMatch(sidebarSource, /vcDotClass/);
  assert.doesNotMatch(sidebarSource, /vcStatusLabel/);
  assert.doesNotMatch(sidebarSource, /"vCenter 已配置"/);
  assert.doesNotMatch(sidebarSource, /"宝塔 可达"/);
});
