import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const ingressSource = read("../src/features/cluster/pages/ClusterK8sAddonsSection.tsx");
const prometheusSource = read("../src/features/settings/components/SettingsPrometheusSection.tsx");
const kubePromSource = read("../src/features/cluster/pages/ClusterK8sKubePrometheusStackSection.tsx");
const vmLogSource = read("../src/features/cluster/pages/ClusterK8sVmLogSection.tsx");
const dashboardSource = read("../src/features/cluster/pages/ClusterK8sDashboardMonitoringSection.tsx");

test("ingress addon exposes namespace and explains controller parameters", () => {
  assert.match(ingressSource, /ingressNamespace/);
  assert.match(ingressSource, /namespace: ingressNamespace/);
  assert.match(ingressSource, /目标命名空间/);
  assert.match(ingressSource, /hostNetwork/);
  assert.match(ingressSource, /IngressClass/);
  assert.match(ingressSource, /固定节点/);
});

test("ingress addon sends namespace for install, patches, node pin, and uninstall", () => {
  for (const endpoint of [
    "/api/k8s/addons/ingress-nginx/install",
    "/api/k8s/addons/ingress-nginx/controller-node",
    "/api/k8s/addons/ingress-nginx/host-ports",
    "/api/k8s/addons/ingress-nginx/uninstall",
  ]) {
    assert.match(ingressSource, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
  assert.match(ingressSource, /namespace: ingressNamespace/g);
});

test("monitoring datasource copy spells out VictoriaMetrics vmselect", () => {
  assert.match(prometheusSource, /监控数据源（Prometheus \/ VictoriaMetrics vmselect）/);
  assert.match(prometheusSource, /VictoriaLogs 是日志系统/);
  assert.doesNotMatch(prometheusSource, /Kubernetes 监控（Prometheus · VM）/);
});

test("monitoring stack exposes namespace, release, retention, and storage options", () => {
  for (const token of [
    "namespace",
    "releaseName",
    "retention",
    "scrapeInterval",
    "storageClassName",
    "storageSize",
    "nodeExporterEnabled",
    "kubeStateMetricsEnabled",
  ]) {
    assert.match(kubePromSource, new RegExp(token));
  }
});

test("VictoriaLogs addon has install and verify flow", () => {
  assert.match(vmLogSource, /\/api\/k8s\/addons\/victoria-logs\/install/);
  assert.match(vmLogSource, /\/api\/k8s\/addons\/victoria-logs\/verify/);
  assert.match(vmLogSource, /collectorEnabled/);
  assert.match(vmLogSource, /autoWriteRuntime/);
});

test("dashboard monitoring exposes target namespaces", () => {
  assert.match(dashboardSource, /metricsServerNamespace/);
  assert.match(dashboardSource, /dashboardNamespace/);
  assert.match(dashboardSource, /latest\/components.yaml/);
});
