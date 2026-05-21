import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const homeSource = read("../src/features/bastion/pages/BastionConsoleHome.tsx");
const sessionSource = read("../src/features/vcenter/pages/VCenterBastion.tsx");

test("bastion home explains ssh settings per target type instead of implying vCenter only", () => {
  assert.doesNotMatch(homeSource, /vCenter \/ SSH 设置/);
  assert.match(homeSource, /vCenter VM 全局 SSH/);
  assert.match(homeSource, /PVE VM\/CT：选中目标后在右上角打开 SSH 设置/);
  assert.match(homeSource, /额外主机：在「策略与分组」里配置地址、凭据与 RDP/);
  assert.match(homeSource, /云主机：在云主机详情中维护 SSH/);
  assert.match(homeSource, /Redis CLI：使用实例连接信息，不走 SSH 凭据/);
  assert.doesNotMatch(homeSource, /请确认 vCenter 已配置/);
});

test("bastion session header reflects all supported target families", () => {
  assert.doesNotMatch(sessionSource, /vCenter 路 JumpServer RDP 路 SSH/);
  assert.match(sessionSource, /vCenter · PVE · 额外主机 · 云主机 · Redis CLI/);
  assert.match(sessionSource, /title="vCenter VM 全局 SSH 设置"/);
  assert.match(sessionSource, />全局 SSH</);
});
