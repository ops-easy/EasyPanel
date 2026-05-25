import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const openSearchTabsList =
  /TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200\/80 bg-slate-50\/80 p-1"/;

test("OpenSearch remains the app-center tab rhythm reference", () => {
  const source = read("../src/features/app-center/opensearch/pages/AppCenterOpenSearch.tsx");

  assert.match(source, /bg-gradient-to-br/);
  assert.match(source, /<Tabs value=\{tab\}/);
  assert.match(source, openSearchTabsList);
  assert.match(source, /TabsTrigger value="deploy"/);
  assert.match(source, /TabsTrigger value="templates"/);
  assert.match(source, /TabsTrigger value="instances"/);
  assert.match(source, /TabsContent value="deploy"/);
});

test("Hermes uses OpenSearch-style page tabs instead of header buttons", () => {
  const source = read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx");

  assert.match(source, /initialTab = "create"/);
  assert.match(source, /from "@\/shared\/ui\/tabs"/);
  assert.match(source, /bg-gradient-to-br/);
  assert.match(source, /<Tabs value=\{tab\}/);
  assert.match(source, openSearchTabsList);
  assert.match(source, /TabsTrigger value="create"[\s\S]*部署向导[\s\S]*TabsTrigger/);
  assert.match(source, /TabsTrigger value="bootstrap"[\s\S]*模板配置[\s\S]*TabsTrigger/);
  assert.match(source, /TabsTrigger value="list"[\s\S]*已部署实例[\s\S]*TabsTrigger/);
  assert.match(source, /TabsContent value="create"/);
  assert.match(source, /TabsContent value="bootstrap"/);
  assert.match(source, /TabsContent value="list"/);
  assert.doesNotMatch(source, /grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3 lg:justify-self-end/);
  assert.doesNotMatch(source, /sm:w-32/);
});

test("OpenClaw and container host overview pages use OpenSearch-style tabs", () => {
  const cases = [
    {
      sourcePath: "../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx",
      listPath: "/cluster/apps/openclaw",
      createPath: "/cluster/apps/openclaw/create",
      bootstrapPath: "/cluster/apps/openclaw/bootstrap",
    },
    {
      sourcePath: "../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx",
      listPath: "/cluster/apps/cloud-vm",
      createPath: "/cluster/apps/cloud-vm/create",
      bootstrapPath: "/cluster/apps/cloud-vm/bootstrap",
    },
  ];

  for (const item of cases) {
    const source = read(item.sourcePath);
    assert.match(source, /initialTab = "create"/);
    assert.match(source, /from "@\/shared\/ui\/tabs"/);
    assert.match(source, /bg-gradient-to-br/);
    assert.match(source, /<Tabs value=\{mainTab\}/);
    assert.match(source, openSearchTabsList);
    assert.match(source, /TabsTrigger value="create"[\s\S]*部署向导[\s\S]*TabsTrigger/);
    assert.match(source, /TabsTrigger value="bootstrap"[\s\S]*模板配置[\s\S]*TabsTrigger/);
    assert.match(source, /TabsTrigger value="list"[\s\S]*已部署实例[\s\S]*TabsTrigger/);
    assert.match(source, /mainTab: "list"/);
    assert.match(source, /TabsContent value="create"/);
    assert.match(source, /TabsContent value="list"/);
    assert.match(source, new RegExp(item.listPath.replaceAll("/", "\\/")));
    assert.match(source, new RegExp(item.createPath.replaceAll("/", "\\/")));
    assert.match(source, new RegExp(item.bootstrapPath.replaceAll("/", "\\/")));
    assert.doesNotMatch(source, /grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3 lg:justify-self-end/);
    assert.doesNotMatch(source, /sm:w-32/);
  }
});

test("OpenClaw and container host bootstrap pages use the same OpenSearch-style tabs", () => {
  const cases = [
    {
      sourcePath: "../src/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap.tsx",
      listPath: "/cluster/apps/openclaw",
      createPath: "/cluster/apps/openclaw/create",
      bootstrapPath: "/cluster/apps/openclaw/bootstrap",
    },
    {
      sourcePath: "../src/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap.tsx",
      listPath: "/cluster/apps/cloud-vm",
      createPath: "/cluster/apps/cloud-vm/create",
      bootstrapPath: "/cluster/apps/cloud-vm/bootstrap",
    },
  ];

  for (const item of cases) {
    const source = read(item.sourcePath);
    assert.match(source, /from "@\/shared\/ui\/tabs"/);
    assert.match(source, /rounded-2xl border border-indigo-200\/80 bg-gradient-to-br from-indigo-50\/90 via-white to-slate-50\/80 px-6 py-6 shadow-sm/);
    assert.match(source, /<Tabs value="bootstrap"/);
    assert.match(source, openSearchTabsList);
    assert.match(source, /TabsTrigger value="create"[\s\S]*部署向导[\s\S]*TabsTrigger/);
    assert.match(source, /TabsTrigger value="bootstrap"[\s\S]*模板配置[\s\S]*TabsTrigger/);
    assert.match(source, /TabsTrigger value="list"[\s\S]*已部署实例[\s\S]*TabsTrigger/);
    assert.match(source, new RegExp(item.listPath.replaceAll("/", "\\/")));
    assert.match(source, new RegExp(item.createPath.replaceAll("/", "\\/")));
    assert.match(source, new RegExp(item.bootstrapPath.replaceAll("/", "\\/")));
    assert.doesNotMatch(source, /grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3 lg:justify-self-end/);
    assert.doesNotMatch(source, /sm:w-32/);
  }
});

test("create route wrappers still mount the tabbed app pages", () => {
  const routes = read("../src/app/routes/app-center-routes.tsx");
  const cloudVmCreate = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVmCreate.tsx");
  const openClawCreate = read("../src/features/app-center/openclaw/pages/AppCenterOpenClawCreate.tsx");
  const hermesCreate = read("../src/features/app-center/hermes/pages/AppCenterHermesCreate.tsx");

  assert.match(routes, /path="cloud-vm\/create"/);
  assert.match(routes, /path="openclaw\/create"/);
  assert.match(routes, /path="hermes\/create"/);
  assert.match(cloudVmCreate, /<AppCenterCloudVm initialTab="create" \/>/);
  assert.match(openClawCreate, /<AppCenterOpenClaw initialTab="create" \/>/);
  assert.match(hermesCreate, /<AppCenterHermes initialTab="create" \/>/);
});

test("app center modules do not auto-redirect incomplete bootstrap to template config", () => {
  const cloudVm = read("../src/features/app-center/cloudvm/pages/AppCenterCloudVm.tsx");
  const openClaw = read("../src/features/app-center/openclaw/pages/AppCenterOpenClaw.tsx");
  const hermes = read("../src/features/app-center/hermes/pages/AppCenterHermes.tsx");

  assert.doesNotMatch(cloudVm, /return <Navigate to=\{BOOTSTRAP_PATH\} replace \/>/);
  assert.doesNotMatch(openClaw, /return <Navigate to=\{OPENCLAW_BOOTSTRAP_PATH\} replace \/>/);
  assert.doesNotMatch(hermes, /return <Navigate to=\{HERMES_BOOTSTRAP_PATH\} replace \/>/);
});
