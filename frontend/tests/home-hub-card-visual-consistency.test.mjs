import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../src/pages/HomeHub.tsx", import.meta.url), "utf8");

function count(pattern) {
  return source.match(pattern)?.length ?? 0;
}

test("workbench module cards share the same summary and hint structure", () => {
  assert.match(source, /function HubStatusPill/);
  assert.match(source, /function HubMetricGrid/);
  assert.match(source, /function HubCardHint/);
  assert.match(source, /min-h-\[360px\]/);

  assert.equal(count(/<HubMetricGrid/g), 8, "each visible workbench module card should have one metric grid");
  assert.equal(count(/<HubCardHint/g), 8, "each visible workbench module card should have one small hint");
  assert.equal(count(/<StatusBadge/g), 4, "configuration cards should share the same configured/unconfigured badge");
});

test("workbench provides one explicit refresh action for summary recovery", () => {
  assert.match(source, /RefreshCw/);
  assert.match(source, /from "@\/shared\/ui\/button"/);
  assert.match(source, /const hubSummaryControls = \[/);
  assert.match(source, /const hubRefreshing = hubSummaryControls\.some\(\(query\) => query\.isFetching\);/);
  assert.match(source, /const refreshHubSummaries = \(\) => \{/);
  assert.match(source, /hubSummaryControls\.forEach\(\(query\) => \{/);
  assert.match(source, /void query\.refetch\(\);/);
  assert.match(source, /刷新摘要/);
  assert.match(source, /<RefreshCw/);
});

test("workbench cards avoid bespoke nested summary cards", () => {
  assert.doesNotMatch(source, /rounded-xl border border-gray-100 bg-gray-50\/80/);
  assert.doesNotMatch(source, /rounded-full bg-/, "status pills should go through HubStatusPill");
});

test("workbench module cards can grow instead of clipping dense summaries", () => {
  assert.doesNotMatch(source, /(?<!min-)h-\[360px\]/, "cards should use a minimum height, not a fixed height");
  assert.doesNotMatch(source, /overflow-hidden/, "cards should not clip longer summaries or entry links");
});

test("all eight workbench module cards route to actionable operation or setup pages", () => {
  for (const route of [
    "/cluster/settings",
    "/cluster",
    "/cluster/compute/config",
    "/cluster/compute/dashboard",
    "/cluster/network/config",
    "/cluster/network/dashboard",
    "/cluster/baota/settings",
    "/cluster/baota",
    "/cluster/apps/dashboard",
    "/cluster/bastion/admin",
    "/cluster/bastion",
    "/cluster/ai-inspect/configure",
    "/cluster/ai-inspect/dashboard",
    "/docs",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("core infrastructure cards route to setup only when providers are missing", () => {
  assert.match(source, /const k8sNeedsSetup = !k8sSummaryLoading && !k8sSummaryError && !k8sOk;/);
  assert.match(source, /to=\{k8sNeedsSetup \? "\/cluster\/settings" : "\/cluster"\}/);
  assert.match(source, /\{k8sNeedsSetup \? "[^"]+" : "[^"]+"\} <ArrowRight size=\{13\} \/>/);

  assert.match(source, /const computeNeedsSetup = !computeLoading && !computeSummaryError && !computeOk;/);
  assert.match(source, /to=\{computeNeedsSetup \? "\/cluster\/compute\/config" : "\/cluster\/compute\/dashboard"\}/);
  assert.match(source, /配置资源源/);
  assert.doesNotMatch(source, /const pveNeedsSetup = !pveTargetsQ\.isLoading && nPveTargets === 0;/);

  assert.match(source, /const networkSummaryLoading = networkDevicesQ\.isLoading \|\| networkDevicesQ\.isFetching;/);
  assert.match(source, /const networkNeedsSetup = !networkSummaryLoading && !networkSummaryError && nNetworkDevices === 0;/);
  assert.match(source, /to=\{networkNeedsSetup \? "\/cluster\/network\/config" : "\/cluster\/network\/dashboard"\}/);
  assert.match(source, /配置网络接入/);
  assert.doesNotMatch(source, /const openWrtNeedsSetup = !networkDevicesQ\.isLoading && nOpenWrtDevices === 0;/);

  assert.match(source, /const baotaNeedsSetup = !baotaSummaryLoading && !baotaSummaryError && !baotaOk;/);
  assert.match(source, /to=\{baotaNeedsSetup \? "\/cluster\/baota\/settings" : "\/cluster\/baota"\}/);
  assert.match(source, /配置宝塔接入/);
});

test("app center workbench total includes DNS domains as managed resources", () => {
  assert.match(source, /appCenterTotal: nr \+ nm \+ nk \+ nc \+ no \+ nh \+ nos \+ nd,/);
  assert.match(source, /\`\$\{appCenterTotal\} 资源\`/);
  assert.match(source, /资源数来自各模块登记数据/);
});

test("app center status reflects summary loading and error states", () => {
  assert.match(source, /const appCenterSummaryQueries = \[/);
  assert.match(source, /const appCenterSummaryLoading = appCenterSummaryQueries\.some\(\(query\) => query\.isLoading \|\| query\.isFetching\);/);
  assert.match(source, /const appCenterMySQLChecking = appStatusQ\.isLoading \|\| appStatusQ\.isFetching;/);
  assert.match(source, /const appCenterMySQLUnavailable = appStatusQ\.isError \|\| \(appStatusQ\.isSuccess && appStatusQ\.data\?\.mysqlReachable === false\);/);
  assert.match(source, /const appCenterSummaryError = appCenterSummaryQueries\.some\(\(query\) => query\.isError\) \|\| appCenterMySQLUnavailable;/);
  assert.match(
    source,
    /const appCenterStatusTone: HubStatusTone = appCenterSummaryLoading\s+\? "slate"\s+: appCenterSummaryError\s+\? "amber"\s+: "emerald";/
  );
  assert.match(
    source,
    /const appCenterStatusLabel = appCenterSummaryLoading\s+\? "检查中…"\s+: appCenterSummaryError\s+\? "摘要异常"\s+: `\$\{appCenterTotal\} 资源`;/
  );
  assert.match(source, /<HubStatusPill[\s\S]*tone=\{appCenterStatusTone\}[\s\S]*\{appCenterStatusLabel\}/);
  assert.doesNotMatch(source, /<HubStatusPill tone="emerald">\s*\{appCenterTotal\} 资源\s*<\/HubStatusPill>/);
});

test("app center status pill hides stale error icons while checking", () => {
  assert.match(
    source,
    /const appCenterStatusIcon = !appCenterSummaryLoading && appCenterSummaryError \? <AlertCircle size=\{11\} \/> : undefined;/
  );
  assert.match(source, /<HubStatusPill\s+tone=\{appCenterStatusTone\}\s+icon=\{appCenterStatusIcon\}\s*>/);
  assert.doesNotMatch(source, /icon=\{appCenterSummaryError \? <AlertCircle size=\{11\} \/> : undefined\}/);
});

test("app center metrics show loading and error states instead of false zeroes", () => {
  assert.match(source, /function queryCountMetric\(\s*query: \{ isLoading: boolean; isFetching: boolean; isError: boolean \},\s*value: number\s*\): number \| string/);
  assert.match(source, /if \(query\.isLoading \|\| query\.isFetching\) return "…";/);
  assert.match(source, /if \(query\.isError\) return "异常";/);

  for (const [name, query, count] of [
    ["Redis", "redisQ", "nRedis"],
    ["MySQL", "mysqlQ", "nMySQL"],
    ["OpenSearch", "openSearchQ", "nOpenSearch"],
    ["CloudVm", "cloudVmQ", "nCloudVm"],
    ["OpenClaw", "openClawQ", "nOpenClaw"],
    ["Hermes", "hermesQ", "nHermes"],
  ]) {
    assert.match(source, new RegExp(`const appCenter${name}Metric = showAppCenter \\? queryCountMetric\\(${query}, ${count}\\) : "受限";`));
  }

  assert.match(source, /<MetricItem label="Redis" value=\{appCenterRedisMetric\} \/>/);
  assert.match(source, /<MetricItem label="MySQL" value=\{appCenterMySQLMetric\} \/>/);
  assert.match(source, /<MetricItem label="Kafka" value=\{appCenterKafkaMetric\} \/>/);
  assert.match(source, /<MetricItem label="OpenSearch" value=\{appCenterOpenSearchMetric\} \/>/);
  assert.match(source, /<MetricItem label="域名" value=\{appCenterDomainsMetric\} \/>/);
  assert.match(source, /<MetricItem label="容器主机" value=\{appCenterCloudVmMetric\} \/>/);
  assert.match(source, /<MetricItem label="OpenClaw" value=\{appCenterOpenClawMetric\} \/>/);
  assert.match(source, /<MetricItem label="Hermes" value=\{appCenterHermesMetric\} \/>/);

  assert.doesNotMatch(source, /<MetricItem label="Redis" value=\{nRedis\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="MySQL" value=\{nMySQL\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="Kafka" value=\{nKafka\} \/>/);
});

test("app center mysql-backed metrics do not look empty when mysql is unavailable", () => {
  assert.match(
    source,
    /function queryMySQLBackedCountMetric\(\s*query: \{ isLoading: boolean; isFetching: boolean; isError: boolean \},\s*value: number,\s*mysqlChecking: boolean,\s*mysqlUnavailable: boolean\s*\): number \| string/
  );
  assert.match(source, /if \(mysqlChecking\) return "…";/);
  assert.match(source, /if \(mysqlUnavailable\) return "MySQL 异常";/);
  assert.match(source, /const appCenterMySQLChecking = appStatusQ\.isLoading \|\| appStatusQ\.isFetching;/);
  assert.match(source, /const appCenterMySQLUnavailable = appStatusQ\.isError \|\| \(appStatusQ\.isSuccess && appStatusQ\.data\?\.mysqlReachable === false\);/);
  assert.match(
    source,
    /const appCenterKafkaMetric = showAppCenter \? queryMySQLBackedCountMetric\(kafkaQ, nKafka, appCenterMySQLChecking, appCenterMySQLUnavailable\) : "受限";/
  );
  assert.match(
    source,
    /const appCenterDomainsMetric = showAppCenter \? queryMySQLBackedCountMetric\(dnsDomainsQ, nDomains, appCenterMySQLChecking, appCenterMySQLUnavailable\) : "受限";/
  );
  assert.doesNotMatch(source, /const appCenterKafkaMetric = showAppCenter \? queryCountMetric\(kafkaQ, nKafka\) : "受限";/);
  assert.doesNotMatch(source, /const appCenterDomainsMetric = showAppCenter \? queryCountMetric\(dnsDomainsQ, nDomains\) : "受限";/);
});

test("network workbench metrics surface summary errors instead of false empty states", () => {
  assert.match(source, /const networkSummaryLoading = networkDevicesQ\.isLoading \|\| networkDevicesQ\.isFetching;/);
  assert.match(source, /const networkIkuaiMetric = queryCountMetric\(networkDevicesQ, nIkuaiDevices\);/);
  assert.match(source, /const networkOpenWrtMetric = queryCountMetric\(networkDevicesQ, nOpenWrtDevices\);/);
  assert.match(source, /const networkDeviceMetric = queryCountMetric\(networkDevicesQ, nNetworkDevices\);/);
  assert.match(
    source,
    /const networkDataSourceMetric = networkSummaryLoading\s+\? "…"\s+: networkDevicesQ\.isError\s+\? "异常"\s+: nNetworkDevices > 0\s+\? "已配置"\s+: "未配置";/
  );

  assert.match(source, /<MetricItem label="iKuai" value=\{networkIkuaiMetric\} \/>/);
  assert.match(source, /<MetricItem label="OpenWrt" value=\{networkOpenWrtMetric\} \/>/);
  assert.match(source, /<MetricItem label="纳管设备" value=\{networkDeviceMetric\} \/>/);
  assert.match(source, /<MetricItem label="数据源" value=\{networkDataSourceMetric\} \/>/);

  assert.doesNotMatch(source, /<MetricItem label="iKuai" value=\{networkDevicesQ\.isLoading \? "…" : nIkuaiDevices\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="纳管设备" value=\{networkDevicesQ\.isLoading \? "…" : nNetworkDevices\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="数据源" value=\{nNetworkDevices > 0 \? "已接入" : "待接入"\} \/>/);
});

test("workbench setup copy uses configuration language instead of stale access placeholders", () => {
  assert.match(source, /各模块配置状态与资源概览/);
  assert.match(source, /配置资源源/);
  assert.match(source, /请先配置 vCenter 或新增 PVE 目标/);
  assert.doesNotMatch(source, /待接入/);
  assert.doesNotMatch(source, /未接入/);
  assert.doesNotMatch(source, /配置接入源/);
  assert.doesNotMatch(source, /请先接入/);
});

test("compute workbench metrics surface provider errors instead of false zeroes", () => {
  assert.match(source, /const vCenterVmMetric = vcOk \? queryCountMetric\(vcVmsQ, nVcVm\) : "未配置";/);
  assert.match(source, /const vCenterHostMetric = vcOk \? queryCountMetric\(vcHostsQ, nVcHost\) : "未配置";/);
  assert.match(
    source,
    /const pveTargetMetric = pveTargetsLoading\s+\? "…"\s+: pveTargetsQ\.isError\s+\? "异常"\s+: nPveTargets > 0\s+\? nPveTargets\s+: "未配置";/
  );

  assert.match(source, /<MetricItem label="vCenter VM" value=\{vCenterVmMetric\} \/>/);
  assert.match(source, /<MetricItem label="ESXi 主机" value=\{vCenterHostMetric\} \/>/);
  assert.match(source, /<MetricItem label="PVE 目标" value=\{pveTargetMetric\} \/>/);

  assert.doesNotMatch(source, /<MetricItem label="vCenter VM" value=\{!vcOk \|\| vcLoading \? \(vcLoading \? "…" : 0\) : nVcVm\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="ESXi 主机" value=\{!vcOk \|\| vcLoading \? \(vcLoading \? "…" : 0\) : nVcHost\} \/>/);
  assert.doesNotMatch(source, /const pveHubStatus = pveTargetsQ\.isLoading/);
});

test("compute workbench card treats app-center cloud VMs as managed hosts", () => {
  assert.match(source, /const computeCloudVmLoading = showAppCenter && \(cloudVmQ\.isLoading \|\| cloudVmQ\.isFetching\);/);
  assert.match(source, /const computeOk = vcOk \|\| nPveTargets > 0 \|\| \(showAppCenter && nCloudVm > 0\);/);
  assert.match(source, /const computeLoading = cfgLoading \|\| vcLoading \|\| pveTargetsLoading \|\| computeCloudVmLoading;/);
  assert.match(source, /const computeSummaryError = vcVmsQ\.isError \|\| vcHostsQ\.isError \|\| pveTargetsQ\.isError \|\| \(showAppCenter && cloudVmQ\.isError\);/);
  assert.match(source, /const computeNeedsSetup = !computeLoading && !computeSummaryError && !computeOk;/);
  assert.match(source, /<MetricItem label="云主机" value=\{appCenterCloudVmMetric\} \/>/);
  assert.doesNotMatch(source, /const computeOk = vcOk \|\| nPveTargets > 0;/);
});

test("compute workbench card stays in checking state while provider summaries refetch", () => {
  assert.match(source, /vcLoading: vcVmsQ\.isLoading \|\| vcVmsQ\.isFetching \|\| vcHostsQ\.isLoading \|\| vcHostsQ\.isFetching,/);
  assert.match(source, /const pveTargetsLoading = pveTargetsQ\.isLoading \|\| pveTargetsQ\.isFetching;/);
  assert.match(source, /const computeCloudVmLoading = showAppCenter && \(cloudVmQ\.isLoading \|\| cloudVmQ\.isFetching\);/);
  assert.match(source, /const computeLoading = cfgLoading \|\| vcLoading \|\| pveTargetsLoading \|\| computeCloudVmLoading;/);
  assert.match(source, /const computeNeedsSetup = !computeLoading && !computeSummaryError && !computeOk;/);
  assert.match(source, /<StatusBadge ok=\{computeOk\} loading=\{computeLoading\} error=\{computeSummaryError\} \/>/);

  for (const query of ["vcVmsQ", "vcHostsQ", "cloudVmQ"]) {
    assert.match(source, new RegExp(`${query}\\.isFetching`));
  }

  assert.doesNotMatch(source, /const computeLoading = cfgLoading \|\| \(!vcOk && pveTargetsQ\.isLoading\);/);
  assert.doesNotMatch(source, /!pveTargetsQ\.isLoading && nPveTargets === 0/);
});

test("kubernetes workbench metrics surface summary errors instead of dashes", () => {
  assert.match(source, /const k8sSummaryLoading = cfgLoading \|\| k8sQ\.isLoading \|\| k8sQ\.isFetching;/);
  assert.match(source, /const k8sMetricValue = \(value\?: number\): number \| string => \{/);
  assert.match(source, /if \(k8sSummaryLoading\) return "…";/);
  assert.match(source, /if \(k8sQ\.isError\) return "异常";/);
  assert.match(source, /if \(!k8sOk\) return "未配置";/);

  assert.match(source, /<MetricItem label="节点" value=\{k8sMetricValue\(k8sQ\.data\?\.nodeCount\)\} \/>/);
  assert.match(source, /<MetricItem label="命名空间" value=\{k8sMetricValue\(k8sQ\.data\?\.namespaceCount\)\} \/>/);
  assert.match(source, /<MetricItem label="Pod" value=\{k8sMetricValue\(k8sQ\.data\?\.podCount\)\} \/>/);
  assert.match(source, /<MetricItem label="服务" value=\{k8sMetricValue\(k8sQ\.data\?\.serviceCount\)\} \/>/);

  assert.doesNotMatch(source, /if \(!k8sOk\) return 0;/);
  assert.doesNotMatch(source, /if \(k8sQ\.isLoading\) return "…";/);
});

test("kubernetes workbench card stays in checking state while summary refetches", () => {
  assert.match(source, /const k8sSummaryLoading = cfgLoading \|\| k8sQ\.isLoading \|\| k8sQ\.isFetching;/);
  assert.match(source, /const k8sSummaryError = !k8sSummaryLoading && k8sQ\.isError;/);
  assert.match(source, /<StatusBadge ok=\{k8sOk\} loading=\{k8sSummaryLoading\} error=\{k8sSummaryError\} \/>/);
  assert.doesNotMatch(source, /<StatusBadge ok=\{k8sOk\} loading=\{cfgLoading\} error=\{k8sSummaryError\} \/>/);
});

test("core workbench status badges surface summary API errors", () => {
  assert.match(
    source,
    /function StatusBadge\(\{ ok, loading, error, errorLabel = "摘要异常" \}: \{ ok: boolean; loading\?: boolean; error\?: boolean; errorLabel\?: string \}\)/
  );
  assert.match(source, /if \(error\) \{[\s\S]*<HubStatusPill tone="amber" icon=\{<AlertCircle size=\{11\} \/>\}>[\s\S]*\{errorLabel\}/);

  assert.match(source, /const k8sSummaryLoading = cfgLoading \|\| k8sQ\.isLoading \|\| k8sQ\.isFetching;/);
  assert.match(source, /const k8sSummaryError = !k8sSummaryLoading && k8sQ\.isError;/);
  assert.match(source, /const computeSummaryError = vcVmsQ\.isError \|\| vcHostsQ\.isError \|\| pveTargetsQ\.isError \|\| \(showAppCenter && cloudVmQ\.isError\);/);
  assert.match(source, /const networkSummaryError = networkDevicesQ\.isError;/);
  assert.match(source, /const baotaSummaryLoading = cfgLoading \|\| baotaIngressQ\.isLoading \|\| baotaIngressQ\.isFetching;/);
  assert.match(source, /const baotaSummaryError = !baotaSummaryLoading && \(\(baotaOk && !baotaReachable\) \|\| baotaIngressQ\.isError\);/);

  assert.match(source, /<StatusBadge ok=\{k8sOk\} loading=\{k8sSummaryLoading\} error=\{k8sSummaryError\} \/>/);
  assert.match(source, /<StatusBadge ok=\{computeOk\} loading=\{computeLoading\} error=\{computeSummaryError\} \/>/);
  assert.match(source, /<StatusBadge ok=\{nNetworkDevices > 0\} loading=\{networkSummaryLoading\} error=\{networkSummaryError\} \/>/);
  assert.match(source, /<StatusBadge ok=\{baotaOk\} loading=\{baotaSummaryLoading\} error=\{baotaSummaryError\} errorLabel=\{baotaStatusErrorLabel\} \/>/);
  assert.match(source, /const networkNeedsSetup = !networkSummaryLoading && !networkSummaryError && nNetworkDevices === 0;/);
  assert.match(source, /const computeNeedsSetup = !computeLoading && !computeSummaryError && !computeOk;/);
});

test("AI inspect workbench status does not mark restricted users as ready", () => {
  assert.doesNotMatch(source, /const aiWorkspaceReady =\s*!isAdmin \|\|/);
  assert.match(source, /const aiWorkspaceRestricted = !isAdmin;/);
  assert.match(
    source,
    /const aiStatusLabel = aiWorkspaceRestricted\s+\? "受限视图"\s+: aiSummaryError\s+\? "摘要异常"\s+: aiWorkspaceReady\s+\? "已就绪"\s+: "待配置";/
  );
  assert.match(source, /\{aiStatusLabel\}/);
});

test("AI inspect workbench card sends admins to configuration when empty", () => {
  assert.match(source, /const aiNeedsSetup = !aiLoading && !aiWorkspaceRestricted && !aiSummaryError && !aiWorkspaceReady;/);
  assert.match(source, /to=\{aiNeedsSetup \? "\/cluster\/ai-inspect\/configure" : "\/cluster\/ai-inspect\/dashboard"\}/);
  assert.match(source, /\{aiNeedsSetup \? "配置观测巡检" : "进入"\} <ArrowRight size=\{13\} \/>/);
  assert.doesNotMatch(source, /to="\/cluster\/ai-inspect\/dashboard"/);
});

test("bastion and AI inspect cards surface summary API errors", () => {
  assert.match(
    source,
    /const bastionSummaryError = bastionTargetsQ\.isError \|\| cloudVmQ\.isError \|\| redisQ\.isError \|\| mysqlQ\.isError;/
  );
  assert.match(
    source,
    /const bastionStatusTone: HubStatusTone = bastionStatusLoading\s+\? "slate"\s+: bastionSummaryError\s+\? "amber"\s+: bastionReady\s+\? "teal"\s+: "amber";/
  );
  assert.match(
    source,
    /const bastionStatusLabel = bastionStatusLoading\s+\? "检查中…"\s+: bastionSummaryError\s+\? "摘要异常"\s+: bastionReady\s+\? "已就绪"\s+: "待配置";/
  );
  assert.match(source, /tone=\{bastionStatusTone\}/);
  assert.match(source, /icon=\{\(!bastionStatusLoading && \(bastionSummaryError \|\| !bastionReady\)\) \? <AlertCircle size=\{11\} \/> : undefined\}/);
  assert.match(source, /\{bastionStatusLabel\}/);

  assert.match(
    source,
    /const aiSummaryError = !aiWorkspaceRestricted && \(aiAlertsQ\.isError \|\| aiProviderQ\.isError \|\| aiReportsQ\.isError \|\| aiPanelsQ\.isError \|\| aiPromQ\.isError\);/
  );
  assert.match(
    source,
    /const aiStatusTone: HubStatusTone = aiWorkspaceRestricted\s+\? "slate"\s+: aiSummaryError\s+\? "amber"\s+: aiWorkspaceReady\s+\? "cyan"\s+: "amber";/
  );
  assert.match(
    source,
    /const aiStatusLabel = aiWorkspaceRestricted\s+\? "受限视图"\s+: aiSummaryError\s+\? "摘要异常"\s+: aiWorkspaceReady\s+\? "已就绪"\s+: "待配置";/
  );
  assert.match(source, /tone=\{aiStatusTone\}/);
  assert.match(source, /icon=\{!aiWorkspaceRestricted && \(aiSummaryError \|\| !aiWorkspaceReady\) \? <AlertCircle size=\{11\} \/> : undefined\}/);
});

test("bastion workbench card sends admins to target policy setup when empty", () => {
  assert.match(source, /const bastionNeedsSetup = !bastionStatusLoading && !bastionSummaryError && !bastionReady && isAdmin;/);
  assert.match(source, /to=\{bastionNeedsSetup \? "\/cluster\/bastion\/admin" : "\/cluster\/bastion"\}/);
  assert.match(source, /\{bastionNeedsSetup \? "配置堡垒目标" : "进入"\} <ArrowRight size=\{13\} \/>/);
  assert.doesNotMatch(source, /to="\/cluster\/bastion"/);
});

test("bastion and AI inspect cards stay in checking state while summary queries refetch", () => {
  assert.match(source, /bastionLoading: bastionTargetsQ\.isLoading \|\| bastionTargetsQ\.isFetching,/);
  assert.match(
    source,
    /const bastionStatusLoading = bastionLoading \|\| cloudVmQ\.isLoading \|\| cloudVmQ\.isFetching \|\| redisQ\.isLoading \|\| redisQ\.isFetching \|\| mysqlQ\.isLoading \|\| mysqlQ\.isFetching;/
  );

  assert.match(
    source,
    /aiLoading:\s+aiAlertsQ\.isLoading \|\| aiAlertsQ\.isFetching \|\|\s+aiProviderQ\.isLoading \|\| aiProviderQ\.isFetching \|\|\s+aiPanelsQ\.isLoading \|\| aiPanelsQ\.isFetching \|\|\s+aiReportsQ\.isLoading \|\| aiReportsQ\.isFetching \|\|\s+aiPromQ\.isLoading \|\| aiPromQ\.isFetching,/
  );

  for (const query of ["bastionTargetsQ", "aiAlertsQ", "aiProviderQ", "aiPanelsQ", "aiReportsQ", "aiPromQ"]) {
    assert.match(source, new RegExp(`${query}\\.isFetching,`));
  }
});

test("AI inspect workbench metrics surface their own query errors", () => {
  assert.match(source, /function queryTextMetric\(\s*query: \{ isLoading: boolean; isFetching: boolean; isError: boolean \},\s*value: string\s*\): string/);
  assert.match(source, /function queryConfiguredMetric\(\s*query: \{ isLoading: boolean; isFetching: boolean; isError: boolean \},\s*configured: boolean\s*\): string/);

  assert.match(source, /const aiPromK8sMetric = queryConfiguredMetric\(aiPromQ, aiPromK8s\);/);
  assert.match(source, /const aiPromVcMetric = queryConfiguredMetric\(aiPromQ, aiPromVc\);/);
  assert.match(source, /const aiRulesMetric = isAdmin \? queryTextMetric\(aiAlertsQ, `\$\{aiRulesOn\}\/\$\{aiRulesTotal\}`\) : "受限";/);
  assert.match(source, /const aiPanelsMetric = queryCountMetric\(aiPanelsQ, aiPanels\);/);
  assert.match(source, /const aiReportsMetric = isAdmin \? queryCountMetric\(aiReportsQ, aiReports\) : "受限";/);
  assert.match(source, /const aiChannelsMetric = isAdmin \? queryCountMetric\(aiAlertsQ, aiChannels\) : "受限";/);

  assert.match(source, /<MetricItem label="K8s 数据源" value=\{aiPromK8sMetric\} \/>/);
  assert.match(source, /<MetricItem label="vCenter 数据源" value=\{aiPromVcMetric\} \/>/);
  assert.match(source, /<MetricItem label="告警规则" value=\{aiRulesMetric\} \/>/);
  assert.match(source, /<MetricItem label="监控面板" value=\{aiPanelsMetric\} \/>/);
  assert.match(source, /<MetricItem label="巡检报告" value=\{aiReportsMetric\} \/>/);
  assert.match(source, /<MetricItem label="通知通道" value=\{aiChannelsMetric\} \/>/);

  assert.doesNotMatch(source, /<MetricItem label="K8s 数据源" value=\{aiLoading \? "…" : aiPromK8s \? "已配置" : "未配置"\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="监控面板" value=\{aiLoading \? "…" : aiPanels\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="通知通道" value=\{isAdmin \? \(aiLoading \? "…" : aiChannels\) : "受限"\} \/>/);
});

test("bastion workbench target metrics surface target inventory errors", () => {
  assert.match(source, /const bastionVmMetric = queryCountMetric\(bastionTargetsQ, nBastionVm\);/);
  assert.match(source, /const bastionExtraHostMetric = queryCountMetric\(bastionTargetsQ, nBastionExtra\);/);
  assert.match(source, /const bastionPowerOnMetric = queryCountMetric\(bastionTargetsQ, nBastionOn\);/);

  assert.match(source, /<MetricItem label="虚拟机" value=\{bastionVmMetric\} \/>/);
  assert.match(source, /<MetricItem label="额外主机" value=\{bastionExtraHostMetric\} \/>/);
  assert.match(source, /<MetricItem label="ESXi 主机" value=\{vCenterHostMetric\} \/>/);
  assert.match(source, /<MetricItem label="开机 VM" value=\{bastionPowerOnMetric\} \/>/);

  assert.doesNotMatch(source, /<MetricItem label="虚拟机" value=\{bastionLoading \? "…" : nBastionVm\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="额外主机" value=\{bastionLoading \? "…" : nBastionExtra\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="ESXi 主机" value=\{vcLoading \? "…" : nVcHost\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="开机 VM" value=\{bastionLoading \? "…" : nBastionOn\} \/>/);
});

test("bastion workbench card exposes MySQL SQL as a first-class console target", () => {
  assert.match(source, /const appCenterMySQLMetric = showAppCenter \? queryCountMetric\(mysqlQ, nMySQL\) : "受限";/);
  assert.match(source, /统一终端：vCenter SSH\/桌面、云主机、Redis CLI 与 MySQL SQL/);
  assert.match(source, /<MetricItem label="MySQL SQL" value=\{appCenterMySQLMetric\} \/>/);
  assert.match(source, /SSH、远程桌面、Redis CLI 与 MySQL SQL 的可连接目标数量/);
  assert.doesNotMatch(source, /统一终端：vCenter SSH\/桌面、云主机与 Redis CLI/);
});

test("hidden workbench modules do not keep fetching their summary APIs", () => {
  assert.match(source, /const appCenterSummaryEnabled = loggedIn && showAppCenter;/);
  assert.match(source, /const aiInspectSummaryEnabled = loggedIn && showAiInspect;/);

  for (const key of [
    "app-center-redis-status-hub",
    "app-center-redis-instances-hub",
    "app-center-mysql-instances-hub",
    "app-center-cloud-vm-instances-hub",
    "app-center-openclaw-instances-hub",
    "app-center-hermes-instances-hub",
    "app-center-opensearch-instances-hub",
  ]) {
    const start = source.indexOf(`queryKey: ["${key}"]`);
    assert.ok(start >= 0, `missing ${key}`);
    const block = source.slice(start, source.indexOf("});", start));
    assert.match(block, /enabled: appCenterSummaryEnabled/);
  }

  assert.match(source, /enabled: appCenterSummaryEnabled && appStatusQ\.data\?\.mysqlReachable === true/);
  assert.doesNotMatch(source, /enabled: appStatusQ\.data\?\.mysqlReachable === true/);

  for (const key of [
    "ops-alerts-hub",
    "ops-ai-provider-hub",
    "ops-inspect-reports-hub",
    "ops-monitoring-panels-hub",
    "prometheus-status-hub",
  ]) {
    const start = source.indexOf(`queryKey: ["${key}"]`);
    assert.ok(start >= 0, `missing ${key}`);
    const block = source.slice(start, source.indexOf("});", start));
    assert.match(block, /enabled: aiInspectSummaryEnabled/);
  }

  assert.doesNotMatch(source, /enabled: loggedIn,\s*$/m);
  assert.doesNotMatch(source, /enabled: loggedIn && isAdmin,\s*$/m);
});

test("cross-module app center metrics show restricted instead of zero when hidden", () => {
  assert.match(
    source,
    /const appCenterCloudVmMetric = showAppCenter \? queryCountMetric\(cloudVmQ, nCloudVm\) : "受限";/
  );
  assert.match(
    source,
    /const appCenterRedisMetric = showAppCenter \? queryCountMetric\(redisQ, nRedis\) : "受限";/
  );
  assert.match(source, /<MetricItem label="云主机" value=\{appCenterCloudVmMetric\} \/>/);
  assert.match(source, /<MetricItem label="Redis CLI" value=\{appCenterRedisMetric\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="云主机" value=\{cloudVmQ\.isLoading \? "…" : nCloudVm\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="Redis CLI" value=\{redisQ\.isLoading \? "…" : nRedis\} \/>/);
});

test("workbench module status pills show readiness instead of child resource details", () => {
  assert.doesNotMatch(source, /\$\{nOpenWrtDevices\} OpenWrt/);
  assert.doesNotMatch(source, /\$\{nBastionDirect\} 台堡垒目标/);
  assert.doesNotMatch(source, /AI Provider 未启用/);

  assert.match(source, /\/api\/bastion\/targets/);
  assert.doesNotMatch(source, /\/api\/vcenter\/bastion\/vms/);
  assert.match(source, /const bastionReady =/);
  assert.match(source, /const aiWorkspaceReady =/);
});

test("docs workbench card uses real document and media summaries", () => {
  assert.match(source, /type DocsListGet = \{/);
  assert.match(source, /type DocsMediaGet = \{/);
  assert.match(source, /type DocsAttachmentStorageGet = \{/);
  assert.match(source, /const docsSummaryEnabled = loggedIn && showDocs;/);

  for (const key of [
    "docs-regular-hub",
    "docs-guides-hub",
    "docs-media-hub",
  ]) {
    const start = source.indexOf(`queryKey: ["${key}"]`);
    assert.ok(start >= 0, `missing ${key}`);
    const block = source.slice(start, source.indexOf("});", start));
    assert.match(block, /enabled: docsSummaryEnabled/);
  }

  const storageStart = source.indexOf('queryKey: ["docs-attachment-storage-hub"]');
  assert.ok(storageStart >= 0, "missing docs attachment storage summary query");
  const storageBlock = source.slice(storageStart, source.indexOf("});", storageStart));
  assert.match(storageBlock, /enabled: docsSummaryEnabled && isAdmin/);

  assert.match(source, /const docsSummaryQueries = isAdmin \? \[docsRegularQ, docsGuidesQ, docsMediaQ, docsStorageQ\] : \[docsRegularQ, docsGuidesQ, docsMediaQ\];/);
  assert.match(source, /const docsSummaryError = docsSummaryQueries\.some\(\(query\) => query\.isError\);/);
  assert.match(source, /const docsStatusLabel = docsSummaryLoading/);
  assert.match(source, /const docsRegularMetric = queryCountMetric\(docsRegularQ, nDocsRegular\);/);
  assert.match(source, /const docsGuidesMetric = queryCountMetric\(docsGuidesQ, nDocsGuides\);/);
  assert.match(source, /const docsMediaMetric = queryCountMetric\(docsMediaQ, nDocsMedia\);/);
  assert.match(source, /<MetricItem label="Markdown" value=\{docsRegularMetric\} \/>/);
  assert.match(source, /<MetricItem label="指南" value=\{docsGuidesMetric\} \/>/);
  assert.match(source, /<MetricItem label="媒体" value=\{docsMediaMetric\} \/>/);
  assert.match(source, /<MetricItem label="附件存储" value=\{docsStorageMetric\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="Markdown" value="可用" \/>/);
  assert.doesNotMatch(source, /<MetricItem label="Markdown" value=\{docsSummaryLoading \? "…" : nDocsRegular\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="指南" value=\{docsSummaryLoading \? "…" : nDocsGuides\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="媒体" value=\{docsSummaryLoading \? "…" : nDocsMedia\} \/>/);
});

test("docs workbench status counts media so ready state never says zero documents", () => {
  assert.match(source, /const docsLibraryTotal = docsTotal \+ nDocsMedia;/);
  assert.match(source, /const docsReady = docsLibraryTotal > 0;/);
  assert.match(
    source,
    /const docsStatusLabel = docsSummaryLoading\s+\? "检查中…"\s+: docsSummaryError\s+\? "摘要异常"\s+: docsReady\s+\? `\$\{docsLibraryTotal\} 项内容`\s+: "待创建";/
  );
  assert.doesNotMatch(source, /docsReady\s+\? `\$\{docsTotal\} 文档`/);
});

test("baota workbench card uses the real ingress inventory", () => {
  assert.match(source, /type HubIngressRow = \{/);
  assert.match(source, /managed\?: boolean;/);
  assert.match(source, /const baotaIngressSummaryEnabled = loggedIn && showBaota && cfg\?\.k8sConfigured === true;/);

  const start = source.indexOf('queryKey: ["baota-ingresses-hub"]');
  assert.ok(start >= 0, "missing baota ingress summary query");
  const block = source.slice(start, source.indexOf("});", start));
  assert.match(block, /apiGetJson<HubIngressRow\[]>\("\/api\/ingresses", \{ signal \}\)/);
  assert.match(block, /enabled: baotaIngressSummaryEnabled/);

  assert.match(source, /const baotaIngressRows = baotaIngressQ\.data \?\? \[];/);
  assert.match(source, /const nBaotaManagedIngresses = baotaIngressRows\.filter\(\(row\) => row\.managed\)\.length;/);
  assert.match(source, /const baotaIngressMetric =/);
  assert.match(source, /const baotaManagedIngressMetric =/);
  assert.match(source, /<MetricItem label="Ingress" value=\{baotaIngressMetric\} \/>/);
  assert.match(source, /<MetricItem label="托管 Ingress" value=\{baotaManagedIngressMetric\} \/>/);
  assert.doesNotMatch(source, /<MetricItem label="Ingress" value=\{baotaOk \? "可同步" : "待配置"\} \/>/);
});

test("baota workbench status surfaces ingress summary errors", () => {
  assert.match(source, /const baotaSummaryLoading = cfgLoading \|\| baotaIngressQ\.isLoading \|\| baotaIngressQ\.isFetching;/);
  assert.match(source, /const baotaSummaryError = !baotaSummaryLoading && \(\(baotaOk && !baotaReachable\) \|\| baotaIngressQ\.isError\);/);
  assert.match(source, /const baotaStatusErrorLabel = baotaIngressQ\.isError \? "路由异常" : "连接异常";/);
  assert.match(source, /<StatusBadge ok=\{baotaOk\} loading=\{baotaSummaryLoading\} error=\{baotaSummaryError\} errorLabel=\{baotaStatusErrorLabel\} \/>/);
});

test("baota workbench card stays in checking state while ingress summary refetches", () => {
  assert.match(source, /const baotaSummaryLoading = cfgLoading \|\| baotaIngressQ\.isLoading \|\| baotaIngressQ\.isFetching;/);
  assert.match(
    source,
    /const baotaIngressMetric = baotaSummaryLoading\s+\? "…"\s+: cfg\?\.k8sConfigured !== true\s+\? "需集群"\s+: baotaIngressQ\.isError\s+\? "异常"\s+: nBaotaIngresses;/
  );
  assert.match(
    source,
    /const baotaManagedIngressMetric = baotaSummaryLoading\s+\? "…"\s+: cfg\?\.k8sConfigured !== true\s+\? "需集群"\s+: baotaIngressQ\.isError\s+\? "异常"\s+: nBaotaManagedIngresses;/
  );
  assert.match(source, /<StatusBadge ok=\{baotaOk\} loading=\{baotaSummaryLoading\} error=\{baotaSummaryError\} errorLabel=\{baotaStatusErrorLabel\} \/>/);
  assert.doesNotMatch(source, /<StatusBadge ok=\{baotaOk\} loading=\{cfgLoading\} error=\{baotaSummaryError\} errorLabel=\{baotaStatusErrorLabel\} \/>/);
  assert.doesNotMatch(source, /const baotaIngressMetric = cfg\?\.k8sConfigured !== true/);
});

test("baota workbench single-panel config does not show zero instances", () => {
  assert.match(
    source,
    /const nConfiguredBaotaTargets = cfg\?\.baotaTargets\?\.filter\(\(t\) => Boolean\(t\.url && t\.hasApiKey\)\)\.length \?\? 0;/
  );
  assert.match(
    source,
    /const nBaotaTargets = nConfiguredBaotaTargets > 0 \? nConfiguredBaotaTargets : baotaOk \? 1 : 0;/
  );
  assert.doesNotMatch(
    source,
    /const nBaotaTargets = cfg\?\.baotaTargets\?\.filter\(\(t\) => Boolean\(t\.url && t\.hasApiKey\)\)\.length \?\? \(baotaOk \? 1 : 0\);/
  );
});
