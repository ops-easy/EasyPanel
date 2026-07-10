import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(rel) {
  return readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

function assertQueryRefreshes(rel, startMarker, endMarker) {
  const source = read(rel);
  const block = sliceBetween(source, startMarker, endMarker);
  assert.match(
    block,
    /refetchInterval:\s*30_000/,
    `${rel} ${startMarker} should auto-refresh every 30s`
  );
}

test("Kubernetes resource management list queries auto-refresh", () => {
  for (const [rel, start, end] of [
    [
      "features/cluster/pages/ClusterK8sListPage.tsx",
      "const dataQ = useQuery({",
      "const yamlKind",
    ],
    [
      "features/cluster/pages/ClusterServices.tsx",
      "const svcQ = useQuery({",
      "const applyMut",
    ],
    [
      "features/cluster/pages/ClusterIngresses.tsx",
      "const ingQ = useQuery({",
      "const applyMut",
    ],
    [
      "features/cluster/pages/ClusterNamespacePicker.tsx",
      "const statsQ = useQuery({",
      "const itemsWithData",
    ],
    [
      "features/cluster/pages/ClusterRBAC.tsx",
      "const q = useQuery({",
      "/** 自动创建 ClusterRole",
    ],
    [
      "features/cluster/pages/ClusterCustomResources.tsx",
      "export function ClusterCustomResourceCrdList()",
      "const qc = useQueryClient();",
    ],
    [
      "features/cluster/pages/ClusterCustomResources.tsx",
      "export function ClusterCustomResourceInstances()",
      "const qc = useQueryClient();",
    ],
    [
      "features/cluster/pages/ClusterNodes.tsx",
      "const podsQ = useQuery({",
      "const runningPods",
    ],
    [
      "features/cluster/pages/ClusterRBACServiceAccountDetail.tsx",
      "const q = useQuery({",
      "return (",
    ],
  ]) {
    assertQueryRefreshes(rel, start, end);
  }
});

test("Kubernetes resource detail overview queries auto-refresh without touching YAML buffers", () => {
  for (const [rel, start, end] of [
    [
      "features/cluster/pages/ClusterPodDetail.tsx",
      "const detailQ = useQuery({",
      "const metricsQ = useQuery({",
    ],
    [
      "features/cluster/pages/ClusterWorkloadDetail.tsx",
      "const listQ = useQuery({",
      "const row = useMemo",
    ],
    [
      "features/cluster/pages/ClusterServiceDetail.tsx",
      "const listQ = useQuery({",
      "const row = useMemo",
    ],
    [
      "features/cluster/pages/ClusterIngressDetail.tsx",
      "const listQ = useQuery({",
      "const row = useMemo",
    ],
    [
      "features/cluster/pages/ClusterConfigMapDetail.tsx",
      "const listQ = useQuery({",
      "const row = useMemo",
    ],
    [
      "features/cluster/pages/ClusterSecretDetail.tsx",
      "const listQ = useQuery({",
      "const row = useMemo",
    ],
    [
      "features/cluster/pages/K8sRelationsCard.tsx",
      "const q = useQuery({",
      "const filterSelf",
    ],
  ]) {
    assertQueryRefreshes(rel, start, end);
  }

  const customResources = read("features/cluster/pages/ClusterCustomResources.tsx");
  const detailBlock = sliceBetween(
    customResources,
    "export function ClusterCustomResourceDetail()",
    "useEffect(() =>"
  );
  assert.match(detailBlock, /refetchInterval:\s*dirty\s*\?\s*false\s*:\s*30_000/);
});

test("Kubernetes resource table actions use stable horizontal layouts", () => {
  const generic = read("features/cluster/pages/ClusterK8sListPage.tsx");
  assert.match(
    generic,
    /className=\{`pl-2 pr-4 text-left text-xs font-semibold text-slate-500 \$\{showPvcExpand \? "w-\[220px\]" : "w-\[180px\]"\}`\}/,
    "Generic Kubernetes resource action headers should be left-aligned with the rest of the table"
  );
  assert.match(generic, /<TableCell className="pl-2 pr-4 text-left align-middle">/);
  assert.match(generic, /className="flex flex-nowrap justify-start gap-1"/);
  assert.doesNotMatch(generic, /className="flex flex-nowrap justify-end gap-1"/);
  assert.match(generic, /showPvcExpand \? "w-\[220px\]" : "w-\[180px\]"/);
  assert.match(generic, /title="编辑 YAML"[\s\S]*aria-label="编辑 YAML"/);
  assert.match(generic, /title="删除资源"[\s\S]*aria-label="删除资源"/);

  const services = read("features/cluster/pages/ClusterServices.tsx");
  assert.match(services, /min-w-\[220px\] pl-2 pr-5 text-left[\s\S]*操作/);
  assert.match(services, /<TableCell className="pl-2 pr-5 text-left align-middle">/);
  assert.match(services, /className="flex flex-nowrap justify-start gap-1"/);
  assert.match(services, /title="删除 Service"[\s\S]*aria-label="删除 Service"/);

  const ingresses = read("features/cluster/pages/ClusterIngresses.tsx");
  assert.match(ingresses, /min-w-\[128px\] pl-2 pr-5 text-left[\s\S]*操作/);
  assert.match(ingresses, /<TableCell className="pl-2 pr-5 text-left align-middle">/);
  assert.match(ingresses, /className="flex flex-nowrap justify-start gap-1"/);
  assert.match(ingresses, /title="编辑 Ingress YAML"[\s\S]*aria-label="编辑 Ingress YAML"/);
  assert.match(ingresses, /title="删除 Ingress"[\s\S]*aria-label="删除 Ingress"/);
});

test("secondary Kubernetes operation tables follow the same action-column rhythm", () => {
  const customResources = read("features/cluster/pages/ClusterCustomResources.tsx");
  assert.match(customResources, /<TableHead className="w-\[120px\] text-left">操作<\/TableHead>/);
  assert.match(customResources, /<TableCell className="text-left">/);
  assert.match(customResources, /title="删除 CRD"[\s\S]*aria-label="删除 CRD"/);

  const nodes = read("features/cluster/pages/ClusterNodes.tsx");
  assert.doesNotMatch(nodes, /<TableHead className="[^"]*text-right[^"]*">操作<\/TableHead>/);
  assert.match(nodes, /<TableHead className="w-\[96px\] text-left text-xs">操作<\/TableHead>/);
  assert.match(nodes, /<TableHead className="h-12 w-\[104px\] text-left text-xs font-semibold uppercase tracking-wide text-slate-600">/);
  assert.match(nodes, /title="打开 Pod 详情"[\s\S]*aria-label="打开 Pod 详情"/);
  assert.match(nodes, /title="查看节点与 Pod"[\s\S]*aria-label="查看节点与 Pod"/);

  const overview = read("features/cluster/pages/ClusterOverviewPodsWorkloadPanel.tsx");
  assert.match(overview, /<TableHead className="pr-3 text-left text-\[11px\]">操作<\/TableHead>/);
  assert.match(overview, /<TableCell className="pr-3 text-left">/);
  assert.match(overview, /<TableHead className="pr-4 text-left text-\[11px\] font-medium text-muted-foreground">操作<\/TableHead>/);
  assert.match(overview, /<TableCell className="pr-4 text-left">/);

  const pvcFiles = read("features/cluster/pages/ClusterPVCFilesPage.tsx");
  assert.match(pvcFiles, /<TableHead className="w-\[220px\] text-left">操作<\/TableHead>/);
  assert.match(pvcFiles, /<TableCell className="text-left">/);
  assert.match(pvcFiles, /className="flex justify-start gap-1"/);
  assert.match(pvcFiles, /title="下载文件"[\s\S]*aria-label="下载文件"/);
  assert.match(pvcFiles, /title="删除文件或目录"[\s\S]*aria-label="删除文件或目录"/);
});
