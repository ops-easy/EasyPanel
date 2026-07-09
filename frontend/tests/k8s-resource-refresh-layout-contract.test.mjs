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
  assert.match(generic, /className="flex flex-nowrap justify-end gap-1"/);
  assert.match(generic, /showPvcExpand \? "w-\[220px\]" : "w-\[180px\]"/);

  const services = read("features/cluster/pages/ClusterServices.tsx");
  assert.match(services, /min-w-\[220px\][\s\S]*操作/);
  assert.match(services, /className="flex flex-nowrap justify-end gap-1"/);

  const ingresses = read("features/cluster/pages/ClusterIngresses.tsx");
  assert.match(ingresses, /min-w-\[128px\][\s\S]*操作/);
  assert.match(ingresses, /className="flex flex-nowrap justify-end gap-1"/);
});
