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
  assert.doesNotMatch(clusterSettingsSource, /Cluster settings/);
  assert.doesNotMatch(clusterSettingsSource, /SettingsPrometheusSection locale="en"/);
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
