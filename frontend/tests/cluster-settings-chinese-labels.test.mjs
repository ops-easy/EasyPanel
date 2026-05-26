import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const clusterSettingsSource = read("../src/features/cluster/pages/ClusterK8sSettings.tsx");
const clusterPrometheusPanelSource = read("../src/features/cluster/pages/ClusterPrometheusPanel.tsx");
const prometheusSettingsSource = read("../src/features/settings/components/SettingsPrometheusSection.tsx");
const runtimeSettingsSource = read("../src/features/settings/components/SettingsRuntimeSection.tsx");
const sidebarSource = read("../src/shared/layout/Sidebar.tsx");

test("cluster settings page uses Chinese for visible page labels", () => {
  assert.match(clusterSettingsSource, />集群设置</);
  for (const label of ["总览", "集群连接", "入口控制器", "监控", "日志", "镜像仓库", "高级"]) {
    assert.match(clusterSettingsSource, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(clusterSettingsSource, /Cluster settings/);
  assert.doesNotMatch(clusterSettingsSource, /SettingsPrometheusSection locale="en"/);
});

test("cluster settings page is organized as deep-linkable task tabs", () => {
  for (const tab of ["overview", "connection", "ingress", "monitoring", "logs", "harbor", "advanced"]) {
    assert.match(clusterSettingsSource, new RegExp(`value: "${tab}"`));
    assert.match(clusterSettingsSource, new RegExp(`TabsContent value="${tab}"`));
  }

  assert.match(clusterSettingsSource, /useSearchParams/);
  assert.match(clusterSettingsSource, /setSearchParams\(\{ tab: next \}/);
  assert.match(clusterSettingsSource, /<Tabs value=\{activeTab\} onValueChange=\{onTabChange\}/);
  assert.match(clusterSettingsSource, /<SettingsStatusStrip/);
});

test("cluster settings advanced tab does not render the kubernetes menu editor", () => {
  assert.doesNotMatch(clusterSettingsSource, /k8sFocus="menu"/);
  assert.doesNotMatch(clusterSettingsSource, /Kubernetes 左侧菜单/);
  assert.doesNotMatch(clusterSettingsSource, /Kubernetes 菜单/);
});

test("cluster settings status strip reads existing config and addon status APIs", () => {
  assert.match(clusterSettingsSource, /APP_CONFIG_QUERY_KEY/);
  assert.match(clusterSettingsSource, /"k8s-addons-status"/);
  assert.match(clusterSettingsSource, /apiGetJson<AddonsStatusResponse>\("\/api\/k8s\/addons\/status"/);
  assert.match(clusterSettingsSource, /StatusTile/);
  assert.match(clusterSettingsSource, /K8s 连接/);
  assert.match(clusterSettingsSource, /Prometheus 栈/);
  assert.match(clusterSettingsSource, /VMLog/);
});

test("k8s runtime settings can render focused task panels", () => {
  assert.match(runtimeSettingsSource, /export type SettingsRuntimeK8sFocus = "all" \| "connection" \| "ingress" \| "harbor" \| "menu"/);
  assert.match(runtimeSettingsSource, /k8sFocus\?: SettingsRuntimeK8sFocus/);
  assert.match(runtimeSettingsSource, /showK8sConnection/);
  assert.match(runtimeSettingsSource, /showK8sIngress/);
  assert.match(runtimeSettingsSource, /showK8sHarbor/);
  assert.match(runtimeSettingsSource, /showK8sMenu/);
});

test("k8s runtime settings uses Chinese labels while keeping field names as hints", () => {
  assert.match(runtimeSettingsSource, /Harbor 根地址/);
  assert.match(runtimeSettingsSource, /Harbor 账号/);
  assert.match(runtimeSettingsSource, /Harbor 密码/);
  assert.match(runtimeSettingsSource, /跳过 TLS 证书校验/);
  assert.match(runtimeSettingsSource, /\? "保存" : "保存运行时配置"/);
  assert.doesNotMatch(runtimeSettingsSource, /\? "Save"/);
  assert.doesNotMatch(runtimeSettingsSource, /\? "Saving/);
});

test("kubernetes sidebar settings entry is localized", () => {
  assert.match(sidebarSource, />集群设置</);
  assert.doesNotMatch(sidebarSource, />Cluster Settings</);
});

test("cluster monitoring fallback link uses Chinese settings copy", () => {
  assert.match(clusterPrometheusPanelSource, /前往集群设置 → 监控/);
  assert.doesNotMatch(clusterPrometheusPanelSource, /前往 Cluster settings/);
});

test("cluster settings Prometheus actions use compact Chinese labels", () => {
  assert.match(prometheusSettingsSource, /"监控数据源"/);
  assert.match(prometheusSettingsSource, /"保存地址"/);
  assert.match(prometheusSettingsSource, /"写入动态配置"/);
  assert.match(prometheusSettingsSource, /"清除覆盖"/);
  assert.match(prometheusSettingsSource, /className="whitespace-nowrap"/);
  assert.doesNotMatch(prometheusSettingsSource, />监控数据源（Prometheus \/ VictoriaMetrics）…</);
});
