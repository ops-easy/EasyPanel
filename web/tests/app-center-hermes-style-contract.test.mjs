import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("OpenClaw overview follows the Hermes app-center page rhythm", () => {
  const source = read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx");

  assert.match(source, /const OPENCLAW_CAPABILITIES = \[/);
  assert.match(source, /OpenClaw 管理能力/);
  assert.match(source, /grid gap-3 sm:grid-cols-3/);
  assert.match(source, /实例列表/);
  assert.match(source, /创建 OpenClaw/);
  assert.match(source, /引导配置/);
  for (const label of ["部署网关", "对话侧栏", "网关探针", "访问暴露", "模型预设", "RBAC 与工具链"]) {
    assert.match(source, new RegExp(label));
  }

  assert.doesNotMatch(source, /bg-gradient-to-br/);
  assert.doesNotMatch(source, /TabsList|TabsTrigger|TabsContent|<Tabs/);
});

test("container host overview follows the Hermes app-center page rhythm", () => {
  const source = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx");

  assert.match(source, /const CLOUD_VM_CAPABILITIES = \[/);
  assert.match(source, /容器主机管理能力/);
  assert.match(source, /grid gap-3 sm:grid-cols-3/);
  assert.match(source, /实例列表/);
  assert.match(source, /创建容器主机/);
  assert.match(source, /引导配置/);
  for (const label of ["SSH 工作机", "持久化数据盘", "资源监控", "自定义软件", "出站代理", "初始化脚本"]) {
    assert.match(source, new RegExp(label));
  }

  assert.doesNotMatch(source, /bg-gradient-to-br/);
  assert.doesNotMatch(source, /TabsList|TabsTrigger|TabsContent|<Tabs/);
});
