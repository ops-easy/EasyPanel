import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const readOptional = (path) => {
  try {
    return read(path);
  } catch {
    return "";
  }
};

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

for (const [name, path] of [
  ["OpenClaw", "../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx"],
  ["container host", "../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx"],
]) {
  test(`${name} bootstrap follows the Hermes card rhythm`, () => {
    const source = read(path);

    assert.match(source, /rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm/);
    assert.match(source, /rounded-xl border border-slate-200 bg-white p-5 shadow-sm/);
    assert.doesNotMatch(source, /bg-gradient-to-br|rounded-2xl|PAGE_PATH|navigator\.clipboard|Copy className/);
  });
}

test("OpenClaw bootstrap uses neutral panels and actions", () => {
  const source = read("../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx");

  assert.doesNotMatch(source, /border-violet-200|bg-violet-50|bg-violet-600|hover:bg-violet-700/);
});

test("container host bootstrap uses neutral panels and actions", () => {
  const source = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx");

  assert.doesNotMatch(
    source,
    /border-emerald-200|bg-emerald-50|border-emerald-100|bg-fuchsia-50|border-fuchsia-200|bg-emerald-600|hover:bg-emerald-700/,
  );
});

test("OpenClaw and container host expose Hermes-style create routes", () => {
  const routes = read("../src/app/routes/app-center-routes.tsx");
  const cloudVmCreate = readOptional("../src/features/app-center/cloudvm/pages/AppCenterCloudVmCreate.tsx");
  const openClawCreate = readOptional("../src/features/app-center/openclaw/pages/AppCenterOpenClawCreate.tsx");

  assert.match(routes, /const AppCenterCloudVmCreate = lazy/);
  assert.match(routes, /const AppCenterOpenClawCreate = lazy/);
  assert.match(routes, /path="cloud-vm\/create"/);
  assert.match(routes, /path="openclaw\/create"/);
  assert.match(cloudVmCreate, /<AppCenterCloudVm initialTab="create" \/>/);
  assert.match(openClawCreate, /<AppCenterOpenClaw initialTab="create" \/>/);
});

test("OpenClaw and container host page switchers expose list create and bootstrap", () => {
  const cases = [
    {
      name: "container host",
      list: "../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx",
      bootstrap: "../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx",
      base: "/cluster/apps/cloud-vm",
      create: "/cluster/apps/cloud-vm/create",
      bootstrapPath: "/cluster/apps/cloud-vm/bootstrap",
    },
    {
      name: "OpenClaw",
      list: "../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx",
      bootstrap: "../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx",
      base: "/cluster/apps/openclaw",
      create: "/cluster/apps/openclaw/create",
      bootstrapPath: "/cluster/apps/openclaw/bootstrap",
    },
  ];

  for (const item of cases) {
    for (const sourcePath of [item.list, item.bootstrap]) {
      const source = read(sourcePath);
      assert.match(source, new RegExp(item.base.replaceAll("/", "\\/")), `${item.name} should link list page`);
      assert.match(source, new RegExp(item.create.replaceAll("/", "\\/")), `${item.name} should link create page`);
      assert.match(source, new RegExp(item.bootstrapPath.replaceAll("/", "\\/")), `${item.name} should link bootstrap page`);
      assert.match(source, /实例列表/);
      assert.match(source, /引导配置/);
    }
  }
});
