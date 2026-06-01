import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "../src");
const repoRoot = path.resolve(__dirname, "../..");

function read(rel) {
  return readFileSync(path.join(srcRoot, rel), "utf8");
}

function readRepo(rel) {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function collectApiCalls(text, marker) {
  const lines = text.split(/\r?\n/);
  const calls = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes(marker)) continue;
    let start = i;
    while (start > 0 && !/api(?:PostJson|PutJson|Delete)\s*(?:<[^>]+>)?\(/.test(lines[start])) {
      start -= 1;
      if (i - start > 8) break;
    }
    let end = i;
    while (end < lines.length - 1 && !lines[end].includes(");")) {
      end += 1;
      if (end - i > 12) break;
    }
    const call = lines.slice(start, end + 1).join("\n");
    if (/api(?:PostJson|PutJson|Delete)\s*(?:<[^>]+>)?\(/.test(call)) {
      calls.push(call);
    }
  }
  return calls;
}

function assertCallsUseConfirm(rel, marker, expected) {
  const text = read(rel);
  const calls = collectApiCalls(text, marker);
  assert.ok(calls.length > 0, `${rel} should call ${marker}`);
  for (const call of calls) {
    assert.match(call, expected, `${rel} call to ${marker} must carry explicit confirm:\n${call}`);
  }
}

test("Kubernetes mutation API calls carry explicit confirm", () => {
  const bodyConfirm = /withK8sMutationConfirm\(|confirm:\s*true/;
  const queryConfirm = /withK8sMutationConfirmQuery\(|confirm=true/;

  for (const rel of [
    "features/cluster/pages/ClusterConfigMapDetail.tsx",
    "features/cluster/pages/ClusterIngressDetail.tsx",
    "features/cluster/pages/ClusterIngresses.tsx",
    "features/cluster/pages/ClusterK8sListPage.tsx",
    "features/cluster/pages/ClusterSecretDetail.tsx",
    "features/cluster/pages/ClusterServiceDetail.tsx",
    "features/cluster/pages/ClusterServices.tsx",
    "features/cluster/pages/ClusterWorkloadDetail.tsx",
    "features/cluster/pages/PodListBlock.tsx",
  ]) {
    assertCallsUseConfirm(rel, "/api/k8s/apply-yaml", bodyConfirm);
  }

  assertCallsUseConfirm("features/cluster/components/PublishIngress.tsx", "/api/ingress/yaml", bodyConfirm);
  assertCallsUseConfirm("features/baota/pages/IngressList.tsx", "/api/ingress/yaml", bodyConfirm);
  assertCallsUseConfirm("features/baota/pages/IngressList.tsx", "/api/ingress/delete", bodyConfirm);
  assertCallsUseConfirm("features/cluster/components/K8sObjectRevisionDialog.tsx", "/api/k8s/object-revisions/rollback", bodyConfirm);
  assertCallsUseConfirm("features/cluster/pages/k8s/K8sGraphicEditDialog.tsx", "/api/k8s/object-json", bodyConfirm);
  assertCallsUseConfirm("features/cluster/pages/ClusterK8sListPage.tsx", "/api/k8s/pvcs/", bodyConfirm);

  for (const [rel, marker] of [
    ["features/cluster/pages/ClusterIngresses.tsx", "/api/k8s/objects/ingress"],
    ["features/cluster/pages/ClusterK8sListPage.tsx", "/api/k8s/objects/"],
    ["features/cluster/pages/ClusterServices.tsx", "/api/k8s/objects/service"],
    ["features/cluster/pages/PodListBlock.tsx", "/api/k8s/objects/pod"],
    ["features/cluster/pages/ClusterWorkloadDetail.tsx", "/restart"],
  ]) {
    assertCallsUseConfirm(rel, marker, queryConfirm);
  }

  const podDetail = read("features/cluster/pages/ClusterPodDetail.tsx");
  assert.match(
    podDetail,
    /apiDelete\(\s*withK8sMutationConfirmQuery\(podApiPath\(namespace,\s*name\)\)\s*\)/,
    "ClusterPodDetail direct pod delete must append confirm=true"
  );
});

test("Kubernetes route-level high-risk mutations are guarded before handlers run", () => {
  const routes = readRepo("backend/common/core/k8s_routes.go");
  for (const route of [
    'api.POST("/k8s/rbac/global-read-user", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/rbac/quick-readonly-user", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/crds/:crdName/instances", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.PUT("/k8s/crds/:crdName/instances/:namespace/:objName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.DELETE("/k8s/crds/:crdName/instances/:namespace/:objName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.DELETE("/k8s/crds/:crdName", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/etcd/defrag-job", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/ingress-nginx/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/ingress-nginx/uninstall", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/dashboard-monitoring/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/kube-prometheus-stack/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/kube-prometheus-stack/sync-runtime", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/addons/victoria-logs/install", AdminOnlyMiddleware(app), k8sMutationConfirmMiddleware(',
    'api.PUT("/k8s/pvc-files/:namespace/:pvcName/write", k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/pvc-files/:namespace/:pvcName/delete", k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/pvc-files/:namespace/:pvcName/mkdir", k8sMutationConfirmMiddleware(',
    'api.POST("/k8s/pvc-files/:namespace/:pvcName/rename", k8sMutationConfirmMiddleware(',
  ]) {
    assert.ok(routes.includes(route), `missing K8s confirmation middleware for ${route}`);
  }
});

test("new Kubernetes management surfaces send confirmation semantics", () => {
  const customResources = read("features/cluster/pages/ClusterCustomResources.tsx");
  assert.match(customResources, /withK8sMutationConfirmQuery\(apiPathCrd\(name\)\)/);
  assert.match(customResources, /apiPostJson\(apiPathCrList\(crdName\) \+ qs, withK8sMutationConfirm\(parsed\)\)/);
  assert.match(customResources, /apiPutJson\(apiPathCrOne\(crdName, namespaceSeg, objName\), withK8sMutationConfirm\(obj\)\)/);
  assert.match(customResources, /withK8sMutationConfirmQuery\(apiPathCrOne\(crdName, namespaceSeg, objName\)\)/);

  const rbac = read("features/cluster/pages/ClusterRBAC.tsx");
  assert.match(rbac, /\/api\/k8s\/rbac\/quick-readonly-user"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(rbac, /ConfirmActionButton[\s\S]*确认创建只读访问凭据/);

  const etcd = read("features/cluster/pages/ClusterEtcdPage.tsx");
  assert.match(etcd, /\/api\/k8s\/etcd\/defrag-job"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(etcd, /ConfirmActionButton[\s\S]*确认创建 etcd defrag Job/);

  const ingressAddon = read("features/cluster/pages/ClusterK8sAddonsSection.tsx");
  for (const marker of [
    "/api/k8s/addons/ingress-nginx/install",
    "/api/k8s/addons/ingress-nginx/controller-node",
    "/api/k8s/addons/ingress-nginx/host-ports",
    "/api/k8s/addons/ingress-nginx/uninstall",
  ]) {
    assert.match(ingressAddon, new RegExp(marker.replaceAll("/", "\\/") + String.raw`"[\s\S]*withK8sMutationConfirm\(`));
  }

  assert.match(
    read("features/cluster/pages/ClusterK8sDashboardMonitoringSection.tsx"),
    /\/api\/k8s\/addons\/dashboard-monitoring\/install"[\s\S]*withK8sMutationConfirm\(/
  );

  const kubeProm = read("features/cluster/pages/ClusterK8sKubePrometheusStackSection.tsx");
  assert.match(kubeProm, /\/api\/k8s\/addons\/kube-prometheus-stack\/install"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(kubeProm, /\/api\/k8s\/addons\/kube-prometheus-stack\/sync-runtime"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(kubeProm, /ConfirmActionButton[\s\S]*确认同步 Prometheus 地址/);

  const vmLogs = read("features/cluster/pages/ClusterK8sVmLogSection.tsx");
  assert.match(vmLogs, /\/api\/k8s\/addons\/victoria-logs\/install"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(vmLogs, /ConfirmActionButton[\s\S]*确认安装或升级 VictoriaLogs/);

  const pvcFiles = read("features/cluster/pages/ClusterPVCFilesPage.tsx");
  assert.match(pvcFiles, /withK8sMutationConfirmQuery\(\s*`\/api\/k8s\/pvc-files/);
  assert.match(pvcFiles, /withK8sMutationConfirm\(\{ name: mkdirName\.trim\(\) \}\)/);
  assert.match(pvcFiles, /withK8sMutationConfirm\(\{\s*from: renameFrom,\s*to: renameTo\.trim\(\),\s*\}\)/);
  assert.match(pvcFiles, /AlertDialog[\s\S]*确认上传文件/);
  assert.match(pvcFiles, /ConfirmActionButton[\s\S]*确认写入 PVC 文件/);

  const overview = read("features/cluster/pages/ClusterOverviewPodsWorkloadPanel.tsx");
  assert.match(overview, /\/api\/k8s\/workloads\/patch-container-resources"[\s\S]*withK8sMutationConfirm\(/);
  assert.match(overview, /ConfirmActionButton[\s\S]*确认按建议修改容器资源/);
});
