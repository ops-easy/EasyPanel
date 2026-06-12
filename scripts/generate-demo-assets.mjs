import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(rootDir, "frontend");
const routeInventoryPath = resolve(webDir, "src", "app", "route-inventory.ts");
const demoDir = resolve(rootDir, "docs", "demo");
const assetDir = resolve(demoDir, "assets");
const tempDir = resolve(rootDir, ".vite");
const host = "127.0.0.1";
const screenshotWidth = 1920;
const screenshotHeight = 1080;
const appShellSelector = '[data-cmp="AppLayout"], [data-cmp="AppLayoutMobile"]';
const renderSmokePostTaskSettleMs = 1200;

const demoRoutes = [
  { path: "/", filename: "easypanel-dashboard.png" },
  { path: "/cluster/ns/easy/pods", filename: "easypanel-kubernetes.png" },
  { path: "/cluster/apps/dashboard", filename: "easypanel-app-center.png" },
  { path: "/cluster/baota", filename: "easypanel-baota-dashboard.png" },
  { path: "/cluster/baota/ingress", filename: "easypanel-ingress.png" },
  { path: "/cluster/baota/sync", filename: "easypanel-baota-sync.png" },
  { path: "/cluster/compute/dashboard", filename: "easypanel-compute.png" },
  { path: "/cluster/network/dashboard", filename: "easypanel-network.png" },
];

const routeParamSamples = {
  namespace: "easy",
  podName: "easypanel-api-7d98cdd7c8-n4p2z",
  moref: "vm-101",
  targetId: "pve-lab",
  node: "pve-node-1",
  guestType: "qemu",
  vmid: "104",
  hostId: "cloud-vm-1",
  id: "redis-1",
  workloadName: "easypanel-api",
  serviceName: "easypanel-api",
  ingressName: "console-ingress",
  pvcName: "data-easypanel-api",
  configMapName: "easypanel-config",
  secretName: "easypanel-secret",
  crdName: "certificates.cert-manager.io",
  objName: "demo-cert",
  projectName: "library",
  repoPath: "easypanel",
  docId: "1",
  name: "easypanel",
};

const routeSmokePathOverrides = {
  "/cluster/ns/:namespace/pods/:podName/terminal":
    "/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z/terminal?container=api",
  "/cluster/ns/:namespace/statefulsets/:workloadName": "/cluster/ns/easy/statefulsets/redis-master",
  "/cluster/ns/:namespace/daemonsets/:workloadName": "/cluster/ns/easy/daemonsets/node-agent",
  "/cluster/apps/kafka/instance/:id": "/cluster/apps/kafka/instance/1",
  "/cluster/apps/kafka/instance/:id/throttle": "/cluster/apps/kafka/instance/1/throttle",
  "/cluster/apps/cloud-vm/:id": "/cluster/apps/cloud-vm/1",
  "/cluster/apps/openclaw/:id": "/cluster/apps/openclaw/openclaw-1",
  "/cluster/apps/hermes/:id": "/cluster/apps/hermes/hermes-1",
};

function readCriticalRoutes() {
  const source = readFileSync(routeInventoryPath, "utf8");
  return Array.from(source.matchAll(/"([^"]+)"/g), (match) => match[1]);
}

function toSmokePath(route) {
  if (routeSmokePathOverrides[route]) return routeSmokePathOverrides[route];
  return route.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, paramName) => {
    return routeParamSamples[paramName] ?? `${paramName}-demo`;
  });
}

const renderSmokeRoutes = Array.from(
  new Map(
    [
      ...demoRoutes.map(({ path }) => path),
      ...readCriticalRoutes().map(toSmokePath),
    ].map((path) => [path, { path }])
  ).values()
);

const routeNeedles = {
  "/": "Kubernetes",
  "/cluster/ns/easy/pods": "easypanel-api",
  "/cluster/apps/dashboard": "Dashboard",
  "/cluster/baota": "API",
  "/cluster/baota/ingress": "Ingress Rules",
  "/cluster/baota/sync": "Baota Sync",
  "/cluster/compute/dashboard": "Dashboard",
  "/cluster/network/dashboard": "NETWORK CENTER",
};

const routeSmokeExpectations = {
  ...Object.fromEntries(Object.entries(routeNeedles).map(([path, expectedText]) => [path, { expectedText }])),
  "/": { expectedText: "Kubernetes" },
  "/settings": { expectedFinalPath: "/account/settings", expectedText: "账户与平台" },
  "/cluster": { expectedText: "集群概览" },
  "/cluster/ns": { expectedText: "命名空间" },
  "/cluster/nodes": { expectedText: "节点" },
  "/cluster/etcd": { expectedText: "etcd" },
  "/cluster/rbac": { expectedText: "RBAC" },
  "/cluster/rbac/sa/easy/easypanel": { expectedText: "easypanel" },
  "/cluster/custom-resources": { expectedText: "自定义资源" },
  "/cluster/custom-resources/certificates.cert-manager.io": { expectedText: "certificates.cert-manager.io" },
  "/cluster/custom-resources/certificates.cert-manager.io/instances/easy/demo-cert": { expectedText: "demo-cert" },
  "/cluster/harbor": { expectedText: "Harbor 镜像仓库" },
  "/cluster/harbor/p/library": { expectedText: "library" },
  "/cluster/harbor/p/library/easypanel": { expectedText: "DIGEST" },
  "/cluster/compute": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/compute/dashboard": { expectedText: "虚拟化 Dashboard" },
  "/cluster/compute/guests": { expectedText: "虚拟机 / CT" },
  "/cluster/compute/hosts": { expectedText: "宿主机 / 节点" },
  "/cluster/compute/storage": { expectedText: "存储" },
  "/cluster/compute/activity": { expectedText: "任务活动" },
  "/cluster/compute/config": { expectedText: "vCenter 连接" },
  "/cluster/compute/vm-settings": { expectedFinalPath: "/cluster/compute/config", expectedText: "vCenter 连接" },
  "/cluster/compute/vcenter": { expectedFinalPath: "/cluster/compute/guests", expectedText: "虚拟机" },
  "/cluster/compute/vcenter/dashboard": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/compute/vcenter/prometheus": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/compute/vcenter/vms/vm-101": { expectedText: "返回虚拟机列表" },
  "/cluster/compute/vcenter/hosts/vm-101": { expectedText: "宿主机列表" },
  "/cluster/compute/vcenter/gpu": { expectedText: "GPU" },
  "/cluster/compute/cloud": { expectedText: "公有云主机" },
  "/cluster/compute/cloud/cloud-vm-1/ssh": { expectedText: "公有云 · SSH / SFTP" },
  "/cluster/compute/bastion": { expectedFinalPath: "/cluster/bastion", expectedText: "堡垒机控制台" },
  "/cluster/compute/tools/ip-scan": { expectedText: "空闲 IP 探测" },
  "/cluster/compute/pve": { expectedFinalPath: "/cluster/compute/guests", expectedText: "虚拟机" },
  "/cluster/compute/pve/nodes/pve-lab/pve-node-1": { expectedText: "返回 PVE 节点" },
  "/cluster/compute/pve/guests/pve-lab/pve-node-1/qemu/104": { expectedText: "PVE" },
  "/cluster/network": { expectedFinalPath: "/cluster/network/dashboard", expectedText: "网络资源中心" },
  "/cluster/network/dashboard": { expectedText: "网络资源中心" },
  "/cluster/network/devices": { expectedText: "设备" },
  "/cluster/network/interfaces": { expectedText: "接口" },
  "/cluster/network/clients": { expectedText: "终端" },
  "/cluster/network/wireless": { expectedText: "无线" },
  "/cluster/network/connections": { expectedText: "防火墙" },
  "/cluster/network/monitoring": { expectedText: "监控" },
  "/cluster/network/access": { expectedText: "网络配置" },
  "/cluster/pods": { expectedText: "easypanel-api" },
  "/cluster/pods/easy/easypanel-api-7d98cdd7c8-n4p2z": {
    expectedFinalPath: "/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z",
    expectedText: "Pod",
  },
  "/cluster/statefulsets": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/services": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/ingresses": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/pvcs": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/configmaps": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/secrets": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/deployments": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/daemonsets": { expectedFinalPath: "/cluster/ns", expectedText: "命名空间" },
  "/cluster/ns/easy": { expectedFinalPath: "/cluster/ns/easy/pods", expectedText: "easypanel-api" },
  "/cluster/ns/easy/pods": { expectedText: "easypanel-api" },
  "/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z": { expectedText: "Pod" },
  "/cluster/ns/easy/pods/easypanel-api-7d98cdd7c8-n4p2z/terminal?container=api": { expectedText: "Pod 终端" },
  "/cluster/ns/easy/deployments": { expectedText: "easypanel-api" },
  "/cluster/ns/easy/deployments/easypanel-api": { expectedText: "Deployment" },
  "/cluster/ns/easy/statefulsets": { expectedText: "redis-master" },
  "/cluster/ns/easy/statefulsets/redis-master": { expectedText: "StatefulSet" },
  "/cluster/ns/easy/daemonsets": { expectedText: "node-agent" },
  "/cluster/ns/easy/daemonsets/node-agent": { expectedText: "DaemonSet" },
  "/cluster/ns/easy/services": { expectedText: "easypanel-api" },
  "/cluster/ns/easy/services/easypanel-api": { expectedText: "Service" },
  "/cluster/ns/easy/ingresses": { expectedText: "console-ingress" },
  "/cluster/ns/easy/ingresses/console-ingress": { expectedText: "Ingress" },
  "/cluster/ns/easy/pvcs": { expectedText: "data-easypanel-api" },
  "/cluster/ns/easy/pvcs/data-easypanel-api/files": { expectedText: "data-easypanel-api" },
  "/cluster/ns/easy/configmaps": { expectedText: "easypanel-config" },
  "/cluster/ns/easy/configmaps/easypanel-config": { expectedText: "ConfigMap" },
  "/cluster/ns/easy/secrets": { expectedText: "easypanel-secret" },
  "/cluster/ns/easy/secrets/easypanel-secret": { expectedText: "Secret" },
  "/cluster/pod-restart-reports": { expectedFinalPath: "/cluster/ai-inspect/reports/pod", expectedText: "Pod 级" },
  "/cluster/baota": { expectedText: "宝塔工作台" },
  "/cluster/baota/ingress": { expectedText: "Ingress Rules" },
  "/cluster/baota/sync": { expectedText: "Baota Sync" },
  "/cluster/settings": { expectedText: "集群设置" },
  "/cluster/baota/settings": { expectedText: "宝塔配置向导" },
  "/cluster/apps": { expectedFinalPath: "/cluster/apps/dashboard", expectedText: "应用中心 · 全局" },
  "/cluster/apps/dashboard": { expectedText: "应用中心 · 全局" },
  "/cluster/apps/redis": { expectedText: "云数据库 Redis" },
  "/cluster/apps/mysql": { expectedText: "云数据库 MySQL" },
  "/cluster/apps/kafka": { expectedText: "云消息队列 Kafka" },
  "/cluster/apps/kafka/instance/1": { expectedText: "返回实例列表" },
  "/cluster/apps/kafka/instance/1/throttle": { expectedText: "Kafka" },
  "/cluster/apps/opensearch": { expectedText: "OpenSearch 集群" },
  "/cluster/apps/dns": { expectedText: "DNS 管理 · DASHBOARD" },
  "/cluster/apps/dns/accounts": { expectedText: "服务商账号" },
  "/cluster/apps/dns/domains": { expectedText: "域名管理" },
  "/cluster/apps/dns/records": { expectedText: "解析记录" },
  "/cluster/apps/dns/failover": { expectedText: "健康监测 / 故障切换" },
  "/cluster/apps/dns/scheduled": { expectedText: "定时任务" },
  "/cluster/apps/dns/certs": { expectedText: "SSL 证书" },
  "/cluster/apps/cloud-vm": { expectedText: "Kubernetes 中的轻量 SSH 工作机入口" },
  "/cluster/apps/cloud-vm/bootstrap": { expectedText: "容器主机镜像与命名空间" },
  "/cluster/apps/cloud-vm/create": { expectedText: "SSH" },
  "/cluster/apps/cloud-vm/1": { expectedText: "返回列表" },
  "/cluster/apps/openclaw": { expectedText: "OpenClaw 网关" },
  "/cluster/apps/openclaw/bootstrap": { expectedText: "OpenClaw 网关镜像与命名空间" },
  "/cluster/apps/openclaw/create": { expectedText: "OpenClaw" },
  "/cluster/apps/openclaw/openclaw-1": { expectedText: "返回列表" },
  "/cluster/apps/hermes": { expectedText: "Hermes 应用" },
  "/cluster/apps/hermes/create": { expectedText: "Hermes 应用" },
  "/cluster/apps/hermes/bootstrap": { expectedText: "Hermes 应用" },
  "/cluster/apps/hermes/hermes-1": { expectedText: "返回 Hermes" },
  "/cluster/bastion": { expectedText: "堡垒机控制台" },
  "/cluster/bastion/session": { expectedText: "主机与终端" },
  "/cluster/bastion/admin": { expectedText: "堡垒机配置" },
  "/cluster/bastion/console/vm-101": { expectedText: "无法加载 WMKS 脚本" },
  "/cluster/ai-inspect": { expectedFinalPath: "/cluster/ai-inspect/dashboard", expectedText: "观测与巡检总览" },
  "/cluster/ai-inspect/dashboard": { expectedText: "观测与巡检总览" },
  "/cluster/ai-inspect/configure": { expectedText: "巡检策略" },
  "/cluster/ai-inspect/monitoring": { expectedText: "监控看板" },
  "/cluster/ai-inspect/alerts": { expectedText: "告警与通知" },
  "/cluster/ai-inspect/logs": { expectedText: "VictoriaLogs 状态总览" },
  "/cluster/ai-inspect/logs/detail": { expectedText: "观测与巡检 · 日志详情" },
  "/cluster/ai-inspect/log-collection": { expectedText: "虚拟机 / 宝塔 → VictoriaLogs" },
  "/cluster/ai-inspect/reports": { expectedText: "巡检报告" },
  "/docs": { expectedText: "文档仓库" },
  "/docs/media": { expectedText: "媒体与附件" },
  "/docs/guides": { expectedText: "页面指南" },
  "/docs/guides/doc/1": { expectedText: "页面指南" },
  "/docs/new": { expectedFinalPath: "/docs", expectedText: "文档仓库" },
  "/docs/doc/1": { expectedText: "Daily operations runbook" },
  "/docs/1/edit": { expectedFinalPath: "/docs/doc/1", expectedText: "Daily operations runbook" },
  "/account/personal": { expectedText: "OIDC" },
  "/account/settings": { expectedText: "账户与平台" },
  "/account/users": { expectedText: "平台用户" },
  "/account/audit": { expectedText: "平台审计" },
  "/account/site-stats": { expectedText: "Harbor" },
  "/cluster/compute/vcenter/vms": { expectedFinalPath: "/cluster/compute/guests", expectedText: "虚拟机" },
  "/cluster/compute/vcenter/hosts": { expectedFinalPath: "/cluster/compute/hosts", expectedText: "宿主机" },
  "/cluster/compute/pve/dashboard": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/compute/pve/targets": { expectedFinalPath: "/cluster/compute/config", expectedText: "配置" },
  "/cluster/compute/pve/nodes": { expectedFinalPath: "/cluster/compute/hosts", expectedText: "宿主机" },
  "/cluster/compute/pve/guests": { expectedFinalPath: "/cluster/compute/guests", expectedText: "虚拟机" },
  "/cluster/compute/pve/storage": { expectedFinalPath: "/cluster/compute/storage", expectedText: "存储" },
  "/cluster/compute/pve/tasks": { expectedFinalPath: "/cluster/compute/activity", expectedText: "任务活动" },
  "/cluster/network/config": { expectedFinalPath: "/cluster/network/access", expectedText: "网络配置" },
  "/cluster/network/ikuai": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/network/ikuai/dashboard": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/network/ikuai/interfaces": { expectedFinalPath: "/cluster/network/interfaces", expectedText: "接口" },
  "/cluster/network/ikuai/clients": { expectedFinalPath: "/cluster/network/clients", expectedText: "终端" },
  "/cluster/network/ikuai/apps": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/network/ikuai/vm-mapping": { expectedFinalPath: "/cluster/network/clients", expectedText: "终端" },
  "/cluster/network/ikuai/exporter": { expectedFinalPath: "/cluster/network/monitoring", expectedText: "监控" },
  "/cluster/network/openwrt": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/network/openwrt/dashboard": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/network/openwrt/interfaces": { expectedFinalPath: "/cluster/network/interfaces", expectedText: "接口" },
  "/cluster/network/openwrt/clients": { expectedFinalPath: "/cluster/network/clients", expectedText: "终端" },
  "/cluster/network/openwrt/connections": { expectedFinalPath: "/cluster/network/connections", expectedText: "防火墙" },
  "/cluster/network/openwrt/wireless": { expectedFinalPath: "/cluster/network/wireless", expectedText: "无线" },
  "/cluster/network/openwrt/exporter": { expectedFinalPath: "/cluster/network/monitoring", expectedText: "监控" },
  "/cluster/vcenter": { expectedFinalPath: "/cluster/compute/guests", expectedText: "虚拟机" },
  "/cluster/vcenter/dashboard": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/vcenter/gpu": { expectedFinalPath: "/cluster/compute/vcenter/gpu", expectedText: "GPU" },
  "/cluster/vcenter/hosts": { expectedFinalPath: "/cluster/compute/hosts", expectedText: "宿主机" },
  "/cluster/vcenter/hosts/vm-101": {
    expectedFinalPath: "/cluster/compute/vcenter/hosts/vm-101",
    expectedText: "宿主机列表",
  },
  "/cluster/vcenter/cloud": { expectedFinalPath: "/cluster/compute/cloud", expectedText: "公有云主机" },
  "/cluster/vcenter/cloud/cloud-vm-1/ssh": {
    expectedFinalPath: "/cluster/compute/cloud/cloud-vm-1/ssh",
    expectedText: "公有云 · SSH / SFTP",
  },
  "/cluster/vcenter/bastion": { expectedFinalPath: "/cluster/bastion/session", expectedText: "主机与终端" },
  "/cluster/vcenter/bastion/session": { expectedFinalPath: "/cluster/bastion/session", expectedText: "主机与终端" },
  "/cluster/vcenter/bastion/admin": { expectedFinalPath: "/cluster/bastion/admin", expectedText: "堡垒机配置" },
  "/cluster/vcenter/bastion/console/vm-101": {
    expectedFinalPath: "/cluster/bastion/console/vm-101",
    expectedText: "无法加载 WMKS 脚本",
  },
  "/cluster/vcenter/tools/ip-scan": { expectedFinalPath: "/cluster/compute/tools/ip-scan", expectedText: "空闲 IP 探测" },
  "/cluster/vcenter/prometheus": { expectedFinalPath: "/cluster/compute/dashboard", expectedText: "虚拟化 Dashboard" },
  "/cluster/vcenter/router": { expectedFinalPath: "/cluster/network/devices", expectedText: "设备" },
  "/cluster/vcenter/vm-101": { expectedFinalPath: "/cluster/compute/vcenter/vms/vm-101", expectedText: "返回虚拟机列表" },
};

function routeSmokeExpectation(path) {
  return routeSmokeExpectations[path] ?? routeSmokeExpectations[path.split("?")[0]] ?? {};
}

const renderSmokeViewports = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "tablet", width: 820, height: 1180, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

function splitEnvList(name) {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectedRenderSmokeRoutes() {
  const filters = splitEnvList("EASYPANEL_RENDER_SMOKE_ROUTE");
  if (filters.length === 0) return renderSmokeRoutes;
  return renderSmokeRoutes.filter((item) =>
    filters.some((filter) => item.path === filter || (filter !== "/" && item.path.includes(filter)))
  );
}

function selectedRenderSmokeViewports() {
  const filters = splitEnvList("EASYPANEL_RENDER_SMOKE_VIEWPORT");
  if (filters.length === 0) return renderSmokeViewports;
  return renderSmokeViewports.filter((viewport) => filters.includes(viewport.name));
}

const standaloneRenderSmokeRoutePatterns = [
  /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal(?:\?|$)/,
  /\/cluster\/bastion\/session(?:\/|$)/,
  /\/cluster\/bastion\/console\/[^/?]+(?:\?|$)/,
];

function isStandaloneRenderSmokeRoute(path) {
  return standaloneRenderSmokeRoutePatterns.some((pattern) => pattern.test(path));
}

function acceptsStandaloneRenderSmokeShell(path, expectation) {
  const finalPath = expectation.expectedFinalPath;
  return isStandaloneRenderSmokeRoute(path) || (typeof finalPath === "string" && isStandaloneRenderSmokeRoute(finalPath));
}

const data = {
  product: "EasyPanel",
  generatedBy: "scripts/generate-demo-assets.mjs",
  seed: "easypanel-open-source-demo-v2",
  generatedAt: "2026-05-26T00:00:00+08:00",
  clusters: [
    { name: "homelab-prod", provider: "Kubernetes", region: "Shanghai home lab", nodes: 8, pods: 246, cpu: 63, memory: 71, status: "healthy" },
    { name: "edge-office", provider: "K3s", region: "Office edge", nodes: 3, pods: 74, cpu: 42, memory: 58, status: "healthy" },
    { name: "lab-gpu", provider: "PVE + Kubernetes", region: "GPU lab", nodes: 5, pods: 118, cpu: 77, memory: 68, status: "watch" },
  ],
  namespaces: [
    { name: "easy", workloads: 12, pods: 24, restarts: 0, traffic: "1.8 TB", owner: "platform" },
    { name: "app-prod", workloads: 38, pods: 132, restarts: 2, traffic: "8.4 TB", owner: "application" },
    { name: "observability", workloads: 16, pods: 42, restarts: 1, traffic: "3.1 TB", owner: "sre" },
    { name: "ingress-nginx", workloads: 5, pods: 12, restarts: 0, traffic: "12.6 TB", owner: "network" },
  ],
  applications: [
    { name: "Redis", module: "cache", instances: 6, version: "7.2", health: 99.98, qps: "18.4k", namespace: "easy" },
    { name: "Kafka", module: "stream", instances: 3, version: "3.8", health: 99.95, qps: "42 MB/s", namespace: "app-prod" },
    { name: "OpenSearch", module: "search", instances: 4, version: "2.15", health: 99.91, qps: "7.8k", namespace: "observability" },
    { name: "OpenClaw", module: "ai gateway", instances: 2, version: "0.9", health: 99.7, qps: "320 req/min", namespace: "easy" },
    { name: "MySQL", module: "database", instances: 5, version: "8.4", health: 99.99, qps: "6.2k", namespace: "app-prod" },
    { name: "Cloud VM", module: "compute", instances: 9, version: "mixed", health: 99.82, qps: "38 jobs/h", namespace: "compute" },
  ],
  ingresses: [
    { host: "console.easypanel.dev", tls: true, upstream: "10.0.8.12:32080", provider: "Baota", namespace: "easy" },
    { host: "logs.easypanel.dev", tls: true, upstream: "10.0.8.21:3100", provider: "ingress-nginx", namespace: "observability" },
    { host: "search.easypanel.dev", tls: true, upstream: "10.0.8.32:9200", provider: "Baota", namespace: "app-prod" },
  ],
  alerts: [
    { level: "P1", title: "lab-gpu CPU pressure", owner: "platform", status: "triaged" },
    { level: "P2", title: "OpenSearch disk watermark", owner: "app-center", status: "watching" },
    { level: "P3", title: "Redis failover rehearsal due", owner: "sre", status: "scheduled" },
  ],
  auditTrail: [
    { actor: "admin", action: "updated OIDC provider", target: "account settings", at: "10:12" },
    { actor: "sre-bot", action: "rotated SSH credential", target: "edge-office", at: "10:18" },
    { actor: "ops", action: "patched Deployment replicas", target: "app-prod/api", at: "10:34" },
    { actor: "admin", action: "published Markdown guide", target: "docs/runbook", at: "10:48" },
  ],
};

const appConfig = {
  baotaUrl: "https://panel.easypanel.dev",
  ddnsHost: "edge.easypanel.dev",
  defaultPort: "32080",
  httpsPort: "32443",
  syncIntervalSec: 60,
  hasBaotaApiKey: true,
  baotaTargets: [
    { id: "bt-main", name: "main-panel", url: "https://panel.easypanel.dev", hasApiKey: true, default: true },
    { id: "bt-edge", name: "edge-panel", url: "https://edge-panel.easypanel.dev", hasApiKey: true },
  ],
  baotaUpstreamHost: "edge.easypanel.dev",
  baotaUpstreamPort: "32080",
  baotaUpstreamScheme: "http",
  baotaSslCertName: "easypanel-wildcard",
  hasBaotaSSLMaterial: true,
  ingressBaotaSyncEnabled: true,
  k8sConfigured: true,
  vcenterConfigured: true,
  prometheusConfigured: true,
  prometheusK8sConfigured: true,
  prometheusVcenterConfigured: true,
  victoriaLogsConfigured: true,
  redisConfigured: true,
  redisConnected: true,
  permissions: {
    k8s: "rw",
    compute: "rw",
    network: "rw",
    vcenter: "rw",
    baota: "rw",
    appcenter: "rw",
    appcenterRedis: "rw",
    appcenterMysql: "rw",
    appcenterCloudVm: "rw",
    k8sPodExec: true,
    k8sPodDelete: true,
    menu: {},
  },
};

const systemCheck = {
  baota: { status: "success", url: "https://panel.easypanel.dev", msg: "demo panel reachable" },
  ddns: { status: "success", host: "edge.easypanel.dev", ips: ["203.0.113.10"], msg: "demo dns resolved", port443: true, httpsPort: "32443" },
  k8s: { ingressInstalled: true, ingressHostNetwork: true, nodeIP: "10.0.8.12" },
};

const pods = [
  { namespace: "easy", name: "easypanel-api-7d98cdd7c8-n4p2z", phase: "Running", node: "node-01", restarts: 0, age: "2d6h", firstContainer: "api", cpuRequestMilli: 500, memRequestBytes: 1024 ** 3 },
  { namespace: "easy", name: "easypanel-web-5fb6d4f9f6-v6k9s", phase: "Running", node: "node-02", restarts: 0, age: "2d6h", firstContainer: "web", cpuRequestMilli: 200, memRequestBytes: 256 * 1024 ** 2 },
  { namespace: "easy", name: "redis-master-0", phase: "Running", node: "node-03", restarts: 1, age: "5d4h", firstContainer: "redis", cpuRequestMilli: 300, memRequestBytes: 768 * 1024 ** 2 },
  { namespace: "easy", name: "mysql-primary-0", phase: "Running", node: "node-01", restarts: 0, age: "8d2h", firstContainer: "mysql", cpuRequestMilli: 900, memRequestBytes: 2 * 1024 ** 3 },
  { namespace: "easy", name: "openclaw-gateway-6b75f9b65b-9p4vr", phase: "Running", node: "node-02", restarts: 0, age: "14h", firstContainer: "gateway", cpuRequestMilli: 450, memRequestBytes: 768 * 1024 ** 2 },
  { namespace: "easy", name: "opensearch-hot-0", phase: "Running", node: "node-04", restarts: 2, age: "4d1h", firstContainer: "opensearch", cpuRequestMilli: 1200, memRequestBytes: 3 * 1024 ** 3 },
  { namespace: "app-prod", name: "orders-api-58f8d775d9-dc42s", phase: "Running", node: "node-05", restarts: 0, age: "19h", firstContainer: "api", cpuRequestMilli: 400, memRequestBytes: 512 * 1024 ** 2 },
  { namespace: "observability", name: "victoria-logs-0", phase: "Running", node: "node-06", restarts: 1, age: "6d8h", firstContainer: "victoria-logs", cpuRequestMilli: 700, memRequestBytes: 1536 * 1024 ** 2 },
];

const podMetricKey = (pod) => `${pod.namespace}/${pod.name}`;

const podMetrics = {
  available: true,
  backend: "demo",
  cpuCoresByPod: Object.fromEntries(pods.map((pod, index) => [podMetricKey(pod), Number((0.08 + index * 0.04).toFixed(2))])),
  memBytesByPod: Object.fromEntries(pods.map((pod, index) => [podMetricKey(pod), (256 + index * 128) * 1024 ** 2])),
  netRxBpsByPod: Object.fromEntries(pods.map((pod, index) => [podMetricKey(pod), (120 + index * 16) * 1024])),
  netTxBpsByPod: Object.fromEntries(pods.map((pod, index) => [podMetricKey(pod), (90 + index * 15) * 1024])),
  cpuCoresByContainer: { api: 0.18, web: 0.07, redis: 0.12, mysql: 0.24, gateway: 0.16, opensearch: 0.32 },
  memBytesByContainer: {
    api: 420 * 1024 ** 2,
    web: 96 * 1024 ** 2,
    redis: 350 * 1024 ** 2,
    mysql: 1200 * 1024 ** 2,
    gateway: 280 * 1024 ** 2,
    opensearch: 1900 * 1024 ** 2,
  },
};

function demoPodDetail(pod) {
  const containerName = pod.firstContainer || "app";
  return {
    namespace: pod.namespace,
    name: pod.name,
    phase: pod.phase,
    node: pod.node,
    restarts: pod.restarts,
    age: pod.age,
    containers: [
      {
        name: containerName,
        image: `ghcr.io/ops-easy/demo-${containerName}:2026.05`,
        cpuRequest: `${pod.cpuRequestMilli ?? 200}m`,
        memoryRequest: `${Math.max(128, Math.round((pod.memRequestBytes ?? 256 * 1024 ** 2) / 1024 ** 2))}Mi`,
        cpuLimit: `${Math.max(500, (pod.cpuRequestMilli ?? 200) * 2)}m`,
        memoryLimit: `${Math.max(256, Math.round(((pod.memRequestBytes ?? 256 * 1024 ** 2) * 1.5) / 1024 ** 2))}Mi`,
      },
    ],
    cpuRequestMilli: pod.cpuRequestMilli,
    memRequestBytes: pod.memRequestBytes,
    cpuLimitMilli: Math.max(500, (pod.cpuRequestMilli ?? 200) * 2),
    memLimitBytes: Math.max(256 * 1024 ** 2, Math.round((pod.memRequestBytes ?? 256 * 1024 ** 2) * 1.5)),
    yaml: [
      "apiVersion: v1",
      "kind: Pod",
      "metadata:",
      `  name: ${pod.name}`,
      `  namespace: ${pod.namespace}`,
      "spec:",
      "  containers:",
      `    - name: ${containerName}`,
      `      image: ghcr.io/ops-easy/demo-${containerName}:2026.05`,
    ].join("\n"),
    events: [
      {
        type: "Normal",
        reason: "Started",
        message: `Started container ${containerName}`,
        count: 1,
        firstTimestamp: "2026-05-26T08:00:00+08:00",
        lastTimestamp: "2026-05-26T08:00:00+08:00",
        age: "2d",
      },
    ],
  };
}

const k8sWorkloads = {
  deployments: [
    {
      namespace: "easy",
      name: "easypanel-api",
      ready: "3/3",
      age: "6d",
      labelSelector: "app=easypanel-api",
      hostNetwork: false,
      podTemplatePorts: [{ container: "api", name: "http", containerPort: 8080, protocol: "TCP" }],
    },
  ],
  statefulsets: [
    {
      namespace: "easy",
      name: "redis-master",
      ready: "1/1",
      age: "12d",
      labelSelector: "app=redis-master",
      hostNetwork: false,
      podTemplatePorts: [{ container: "redis", name: "redis", containerPort: 6379, protocol: "TCP" }],
    },
  ],
  daemonsets: [
    {
      namespace: "easy",
      name: "node-agent",
      ready: "8/8",
      age: "10d",
      labelSelector: "app=node-agent",
      hostNetwork: true,
      podTemplatePorts: [{ container: "agent", name: "metrics", containerPort: 9100, protocol: "TCP" }],
    },
  ],
};

const k8sServices = [
  {
    namespace: "easy",
    name: "easypanel-api",
    labels: "app=easypanel-api",
    type: "ClusterIP",
    clusterIP: "10.96.12.34",
    ports: ["http:8080/TCP->8080"],
    portEntries: [{ name: "http", port: 8080, protocol: "TCP", target: "8080" }],
    age: "6d",
  },
];

const k8sIngresses = [
  {
    namespace: "easy",
    name: "console-ingress",
    class: "nginx",
    hosts: ["console.easypanel.dev"],
    tls: true,
    backends: ["easypanel-api:8080"],
    age: "6d",
    managed: true,
  },
];

const k8sPvcs = [
  { namespace: "easy", name: "data-easypanel-api", status: "Bound", capacity: "20Gi", storageClass: "local-path", accessModes: ["ReadWriteOnce"], age: "6d" },
];

const k8sConfigMaps = [
  { namespace: "easy", name: "easypanel-config", keys: 4, age: "6d" },
];

const k8sSecrets = [
  { namespace: "easy", name: "easypanel-secret", type: "Opaque", keys: 3, age: "6d" },
];

function namespaceRows(rows, namespace) {
  return namespace ? rows.filter((row) => row.namespace === namespace) : rows;
}

function demoObjectYaml(kind, namespace, name) {
  return {
    yaml: [
      "apiVersion: v1",
      `kind: ${kind}`,
      "metadata:",
      `  name: ${name}`,
      `  namespace: ${namespace}`,
      "  labels:",
      "    app.kubernetes.io/managed-by: easypanel",
    ].join("\n"),
  };
}

const demoCustomResource = {
  apiVersion: "cert-manager.io/v1",
  kind: "Certificate",
  metadata: {
    namespace: "easy",
    name: "demo-cert",
    uid: "demo-cert-uid",
    creationTimestamp: "2026-05-26T08:00:00+08:00",
    ownerReferences: [
      {
        apiVersion: "cert-manager.io/v1",
        kind: "Issuer",
        name: "letsencrypt-prod",
        uid: "issuer-demo-uid",
      },
    ],
  },
  spec: { dnsNames: ["console.easypanel.dev"], secretName: "console-tls" },
  status: { conditions: [{ type: "Ready", status: "True" }] },
};

const harborDemoRepositories = [
  { id: 1, name: "library/easypanel", artifact_count: 2, pull_count: 128, update_time: "2026-05-26T08:00:00+08:00" },
  { id: 2, name: "library/openclaw", artifact_count: 1, pull_count: 54, update_time: "2026-05-25T08:00:00+08:00" },
];

const harborDemoArtifacts = [
  {
    id: 101,
    digest: "sha256:7a7f0d8e7b9fdemo",
    tags: [{ name: "v1.0.0", push_time: "2026-05-26T08:00:00+08:00" }],
    push_time: "2026-05-26T08:00:00+08:00",
    size: 386 * 1024 ** 2,
    manifest_media_type: "application/vnd.oci.image.manifest.v1+json",
    addition_links: { build_history: { href: "/demo/build_history" } },
    scan_overview: { summary: { critical: 0, high: 1, medium: 3, low: 8, fixable: 2 } },
  },
];

const openClawModePresets = [
  {
    id: "full",
    label: "Full",
    description: "Complete OpenClaw gateway image for cluster operations.",
    image: "ghcr.io/openclaw/openclaw:main",
    initContainerImage: "busybox:1.36",
  },
  {
    id: "slim",
    label: "Slim",
    description: "Lightweight gateway image for chat-first workloads.",
    image: "ghcr.io/openclaw/openclaw:slim",
    initContainerImage: "busybox:1.36",
  },
  {
    id: "corp",
    label: "Private registry",
    description: "Template for an internally mirrored OpenClaw gateway image.",
    image: "harbor.example.com/library/openclaw:main",
    initContainerImage: "harbor.example.com/library/busybox:1.36",
  },
];

const openClawRBACPresets = [
  {
    id: "readonly",
    label: "Read only",
    description: "Allow the gateway ServiceAccount to get, list, and watch cluster resources.",
    clusterRoleName: "easypanel-openclaw-readonly",
  },
  {
    id: "edit",
    label: "Edit",
    description: "Allow the gateway ServiceAccount to update common cluster resources.",
    clusterRoleName: "easypanel-openclaw-edit",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Allow the gateway ServiceAccount to administer cluster resources.",
    clusterRoleName: "easypanel-openclaw-admin",
  },
];

const openClawToolchainOptions = {
  toolchains: [
    { id: "minimal", label: "Minimal", description: "Small tool surface for read-mostly assistant flows." },
    { id: "coding", label: "Coding", description: "Development and execution oriented tool profile." },
    { id: "full", label: "Full", description: "Full OpenClaw tool profile for trusted operations." },
  ],
  promptPacks: [
    { id: "k8s_execute_first", label: "K8s execute first", description: "Use cluster tools before answering." },
    { id: "respond_with_concrete", label: "Concrete answers", description: "Prefer resource names, counts, and next actions." },
    { id: "ollama_tools_note", label: "Ollama tool note", description: "Remind local models to attempt tool calls." },
  ],
  ollamaModelRecommendations: [
    { id: "qwen2.5:14b", note: "Good general local model for tool-style prompts." },
    { id: "llama3.1:8b", note: "Small footprint option for homelab clusters." },
  ],
};

const openClawImageCatalog = {
  entries: openClawModePresets.map(({ id, label, image }) => ({ id, label, image })),
  registryBase: "",
  repository: "openclaw",
  presets: [],
};

const openClawImageCatalogResponse = {
  mode: "entries",
  options: openClawImageCatalog.entries,
  catalog: openClawImageCatalog,
};

const appInstances = {
  redis: Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    name: `redis-${index + 1}`,
    mode: index === 0 ? "k8s-standalone" : "standalone",
    summary: {
      mode: index === 0 ? "k8s-standalone" : "standalone",
      db: 0,
      hasPassword: true,
      addr: `redis-${index + 1}.easy.svc:6379`,
      k8sNamespace: index === 0 ? "easy" : undefined,
      k8sBaseName: `redis-${index + 1}`,
      k8sTopology: "standalone",
      k8sSvcPort: 6379,
      k8sServiceType: "clusterip",
      k8sEngineLine: "7.2",
      k8sMaxmemory: "512mb",
      k8sMaxmemoryPolicy: "allkeys-lru",
      k8sAppendonly: true,
      k8sRedisImageResolved: "redis:7.2-alpine",
      k8sExporterEnabled: true,
      k8sExporterImageResolved: "oliver006/redis_exporter:v1.62.0",
      k8sRedisCpuRequest: "100m",
      k8sRedisCpuLimit: "500m",
      k8sRedisMemoryRequest: "256Mi",
      k8sRedisMemoryLimit: "768Mi",
      k8sPersistenceEnabled: true,
      k8sStorageSize: "5Gi",
      k8sTemplateId: 1,
      k8sTemplateName: "default-redis",
    },
    createdAt: "2026-05-26T08:00:00+08:00",
    createdBy: "demo",
  })),
  mysql: Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    name: `mysql-${index + 1}`,
    mode: index === 0 ? "k8s" : "external",
    summary: {
      mode: index === 0 ? "k8s" : "external",
      host: `mysql-${index + 1}.app-prod.svc`,
      port: 3306,
      username: "root",
      defaultSchema: index === 0 ? "easypanel" : "appdb",
      tlsMode: "disabled",
      hasPassword: true,
      k8sManaged: index === 0,
      k8sNamespace: "app-prod",
      k8sBaseName: `mysql-${index + 1}`,
      k8sServiceType: "ClusterIP",
      k8sSvcPort: 3306,
      k8sVersionLine: "8.4",
      k8sMysqlImageResolved: "mysql:8.4",
      k8sExporterEnabled: true,
      k8sPersistenceEnabled: true,
      k8sStorageSize: "20Gi",
      k8sTemplateId: 1,
      k8sTemplateName: "default-mysql",
    },
    createdAt: "2026-05-26T08:00:00+08:00",
    createdBy: "demo",
  })),
  kafka: Array.from({ length: 3 }, (_, index) => ({
    id: index + 1,
    name: `kafka-${index + 1}`,
    config: {
      namespace: "app-prod",
      baseName: `kafka-${index + 1}`,
      zookeeperImage: "docker.io/zookeeper:3.9.3",
      kafkaImage: "docker.io/bitnamilegacy/kafka:3.7.1",
      busyboxImage: "docker.io/library/busybox:1.36.1",
      zkReplicas: 3,
      kafkaReplicas: 3,
      zkStorageSize: "20Gi",
      kafkaStorageSize: "100Gi",
      saslMechanism: "SCRAM-SHA-512",
      defaultSaslUsername: "admin",
      externalExposure: "nodeport",
      externalAdvertiseHost: "edge.easypanel.dev",
    },
  })),
  opensearch: Array.from({ length: 4 }, (_, index) => ({ id: `opensearch-${index + 1}`, name: `opensearch-${index + 1}`, namespace: "observability" })),
  cloudVm: Array.from({ length: 9 }, (_, index) => ({
    id: index + 1,
    name: `cloud-vm-${index + 1}`,
    namespace: "easy",
    provider: index % 2 ? "pve" : "vcenter",
    createdAt: "2026-05-26T08:00:00+08:00",
    summary: {
      nodeIP: `10.0.8.${12 + index}`,
      sshPort: 32022 + index,
      phase: "running",
      image: "ghcr.io/ops-easy/cloud-vm:ubuntu-22.04",
      installHysteria2: index === 0,
      hysteria2ClusterEndpoint: index === 0 ? "cloud-vm-1.easy.svc:8080" : undefined,
      hysteria2Port: index === 0 ? 8080 : undefined,
    },
  })),
  openclaw: Array.from({ length: 2 }, (_, index) => {
    const id = `openclaw-${index + 1}`;
    return {
      id,
      displayName: `OpenClaw ${index + 1}`,
      namespace: "easy",
      deploymentName: id,
      serviceName: `${id}-svc`,
      image: index === 0 ? "ghcr.io/openclaw/openclaw:main" : "ghcr.io/openclaw/openclaw:slim",
      gatewayPort: 8080,
      nodePort: 32080 + index,
      modelPreset: index === 0 ? "openai" : "ollama",
      chatModel: index === 0 ? "gpt-4o-mini" : "qwen2.5:14b",
      chatProxyCount: 12 + index,
      chatProxyCountViewer: 4 + index,
      upstreamCheckStatus: "ok",
      upstreamCheckMessage: "demo upstream ready",
      upstreamCheckAt: "2026-05-26T08:00:00+08:00",
      clusterV1BaseUrl: `http://${id}-svc.easy.svc.cluster.local:8080/v1`,
      externalV1Url: `https://${id}.easypanel.dev/v1`,
      nodeAccessIp: `10.0.8.${40 + index}`,
      exposeMode: "nodeport",
      publicV1Url: `https://${id}.easypanel.dev/v1`,
      createdAt: "2026-05-26T08:00:00+08:00",
      gatewayTokenSet: true,
      gatewayTokenPreview: "demo-token",
      rbacPreset: index === 0 ? "readonly" : "edit",
      rbacClusterRoleName: index === 0 ? "easypanel-openclaw-readonly" : "easypanel-openclaw-edit",
      clusterRoleBindingName: `${id}-binding`,
      toolsProfile: index === 0 ? "full" : "coding",
      promptPacks: ["k8s_execute_first", "respond_with_concrete"],
    };
  }),
  hermes: Array.from({ length: 2 }, (_, index) => {
    const id = `hermes-${index + 1}`;
    return {
      id,
      displayName: `Hermes ${index + 1}`,
      namespace: "easy",
      deploymentName: id,
      serviceName: `${id}-svc`,
      image: "ghcr.io/stellar-hermes/hermes:latest",
      mode: index === 0 ? "gateway-dashboard" : "gateway",
      modelProvider: "openai",
      modelName: "gpt-4o-mini",
      homePvcName: `${id}-home`,
      secretName: `${id}-secret`,
      configMapName: `${id}-config`,
      exposeMode: "nodePort",
      publicUrl: `https://${id}.easypanel.dev`,
      nodePort: 32180 + index,
      replicas: 1,
      ready: true,
      lastProbeAt: "2026-05-26T08:00:00+08:00",
      createdAt: "2026-05-26T08:00:00+08:00",
    };
  }),
};

const cloudHosts = appInstances.cloudVm.map((host, index) => ({
  id: host.id,
  name: host.name,
  sshHost: `10.0.40.${index + 10}`,
  sshPort: 22,
  sshUser: "ops",
  nodeExporterInstance: `10.0.40.${index + 10}:9100`,
  comment: host.provider === "pve" ? "PVE container host" : "vCenter cloud host",
}));

function openClawK8sStatuses() {
  return {
    statuses: Object.fromEntries(
      appInstances.openclaw.map((instance, index) => [
        instance.id,
        {
          k8sAvailable: true,
          phase: "ready",
          message: "demo OpenClaw gateway is ready",
          deploymentFound: true,
          readyReplicas: 1,
          desiredReplicas: 1,
          podPhase: "Running",
          podName: `${instance.deploymentName}-7d98cdd7c8-${index + 1}`,
          podReady: true,
          templateGatewayImage: instance.image,
          platformInitRevisionAligned: true,
          openclawRbacClientGoChecked: true,
          openclawRbacClientGoFullyAligned: true,
          openclawRbacExpectedClusterRole: instance.rbacClusterRoleName,
          openclawRbacLiveClusterRoleName: instance.rbacClusterRoleName,
          openclawRbacExpectedServiceAccount: instance.deploymentName,
          openclawRbacPodTemplateSA: instance.deploymentName,
          openclawRbacPodTemplateSAOk: true,
          openclawRbacClusterRoleBindingFound: true,
          openclawRbacBindingMatchesRegistration: true,
          openclawRbacSARListPodsAllowed: true,
        },
      ])
    ),
  };
}

function openClawFileResponse(url) {
  const { searchParams } = new URL(url);
  const path = searchParams.get("path") || "openclaw.json";
  if (path === "openclaw.json") {
    return {
      path,
      content: JSON.stringify(
        {
          model: "gpt-4o-mini",
          tools: { profile: "full" },
          agents: { defaults: { provider: "openai" } },
        },
        null,
        2
      ),
    };
  }
  return {
    path,
    content: "# Demo OpenClaw configuration\n\nThis file is rendered by the frontend smoke mock.\n",
  };
}

const ingressRows = data.ingresses.map((ingress, index) => ({
  namespace: ingress.namespace,
  name: `${ingress.host.split(".")[0]}-ingress`,
  hosts: [ingress.host],
  class: index === 1 ? "nginx" : "baota",
  createdAt: new Date(Date.UTC(2026, 4, 20 + index, 2, 30)).toISOString(),
  modifiedAt: new Date(Date.UTC(2026, 4, 25, 2 + index, 10)).toISOString(),
  managed: true,
  ddnsPort: index === 1 ? "32443" : "32080",
  upstreamHost: ingress.upstream,
  scheme: ingress.tls ? "https" : "http",
  baotaTargetId: index === 1 ? "bt-edge" : "bt-main",
}));

const computeProviders = [
  {
    provider: "vcenter",
    name: "vCenter Shanghai Lab",
    configured: true,
    healthy: true,
    hint: "vSphere 8.0 / 4 hosts",
    baseUrl: "https://vcenter.easypanel.dev/sdk",
  },
  {
    provider: "pve",
    targetId: "pve-lab",
    name: "PVE GPU Lab",
    configured: true,
    healthy: true,
    hint: "Proxmox VE / 2 nodes",
    baseUrl: "https://pve.easypanel.dev:8006",
  },
];

const computeSummary = {
  providers: computeProviders,
  counts: { guests: 27, hosts: 6, storage: 12, activity: 41, warnings: 2 },
  health: { ok: 31, idle: 8, warning: 2, critical: 0, unknown: 1 },
  hotspots: [
    { kind: "storage", provider: "vcenter", resourceId: "datastore-fast-01", name: "datastore-fast-01", health: "warning", status: "capacity", statusLabel: "82% used" },
    { kind: "guest", provider: "pve", resourceId: "vm-104", name: "gpu-trainer-104", health: "warning", status: "cpu", statusLabel: "CPU pressure" },
  ],
  recentFailures: [
    { kind: "task", provider: "pve", resourceId: "UPID:pve-lab:1001", name: "nightly backup retry", health: "warning", status: "failed", statusLabel: "retry queued" },
  ],
  warningCount: 2,
  warnings: ["PVE GPU Lab backup queue is above demo threshold"],
};

const computeGuests = [
  {
    kind: "guest",
    provider: "vcenter",
    targetId: "vcenter",
    resourceId: "vm-101",
    name: "prod-api-101",
    health: "ok",
    status: "poweredOn",
    statusLabel: "powered on",
    node: "esxi-1",
    ip: "10.0.20.101",
    cpu: 4,
    memoryMB: 8192,
    source: { moref: "vm-101", guestFullName: "Ubuntu Linux (64-bit)" },
  },
  {
    kind: "guest",
    provider: "pve",
    targetId: "pve-lab",
    resourceId: "104",
    name: "gpu-trainer-104",
    health: "warning",
    status: "running",
    statusLabel: "running",
    node: "pve-node-1",
    ip: "10.0.30.104",
    guestType: "qemu",
    source: { vmid: 104, node: "pve-node-1", type: "qemu", maxmem: 16 * 1024 ** 3 },
  },
];

const computeHosts = [
  {
    kind: "host",
    provider: "vcenter",
    targetId: "vcenter",
    resourceId: "host-101",
    name: "esxi-1",
    health: "ok",
    status: "connected",
    statusLabel: "connected",
    ip: "10.0.20.11",
    cpu: 64,
    memoryMB: 262144,
    source: { moref: "host-101", vendor: "VMware" },
  },
  {
    kind: "host",
    provider: "pve",
    targetId: "pve-lab",
    resourceId: "pve-node-1",
    name: "pve-node-1",
    health: "warning",
    status: "online",
    statusLabel: "backup queue",
    ip: "10.0.30.11",
    source: { node: "pve-node-1", uptime: 864000 },
  },
];

const computeStorage = [
  {
    kind: "storage",
    provider: "vcenter",
    targetId: "vcenter",
    resourceId: "datastore-fast-01",
    name: "datastore-fast-01",
    health: "warning",
    status: "capacity",
    statusLabel: "82% used",
    node: "esxi-1",
    source: { capacity: 8 * 1024 ** 4, free: 1.4 * 1024 ** 4, type: "vmfs" },
  },
  {
    kind: "storage",
    provider: "pve",
    targetId: "pve-lab",
    resourceId: "local-zfs",
    name: "local-zfs",
    health: "ok",
    status: "available",
    statusLabel: "available",
    node: "pve-node-1",
    source: { storage: "local-zfs", type: "zfspool", total: 4 * 1024 ** 4, used: 1.2 * 1024 ** 4 },
  },
];

const computeActivity = [
  {
    kind: "task",
    provider: "pve",
    targetId: "pve-lab",
    resourceId: "UPID:pve-lab:1001",
    name: "nightly backup retry",
    health: "warning",
    status: "failed",
    statusLabel: "retry queued",
    node: "pve-node-1",
    source: { upid: "UPID:pve-lab:1001", user: "root@pam", starttime: 1779772800 },
  },
  {
    kind: "event",
    provider: "vcenter",
    targetId: "vcenter",
    resourceId: "evt-42",
    name: "prod-api-101 migrated",
    health: "ok",
    status: "completed",
    statusLabel: "completed",
    node: "esxi-1",
    source: { user: "administrator@vsphere.local" },
  },
];

const pveTargets = [
  { id: "pve-lab", name: "PVE GPU Lab", url: "https://pve.easypanel.dev:8006", enabled: true, configured: true },
  { id: "pve-edge", name: "PVE Edge", url: "https://pve-edge.easypanel.dev:8006", enabled: true, configured: true },
];

const pveNodes = [
  { node: "pve-node-1", status: "online", cpu: 0.58, mem: 48 * 1024 ** 3, maxmem: 128 * 1024 ** 3, uptime: 864000 },
  { node: "pve-node-2", status: "online", cpu: 0.42, mem: 38 * 1024 ** 3, maxmem: 128 * 1024 ** 3, uptime: 648000 },
];

const pveGuests = [
  { vmid: 104, name: "gpu-trainer-104", node: "pve-node-1", type: "qemu", status: "running", cpu: 0.66, mem: 6 * 1024 ** 3, maxmem: 16 * 1024 ** 3 },
  { vmid: 106, name: "edge-lxc-106", node: "pve-node-2", type: "lxc", status: "running", cpu: 0.18, mem: 1 * 1024 ** 3, maxmem: 4 * 1024 ** 3 },
];

const pveStorage = [
  { storage: "local-zfs", node: "pve-node-1", type: "zfspool", total: 4 * 1024 ** 4, used: 1.2 * 1024 ** 4, active: 1 },
  { storage: "backup-nas", node: "pve-node-1", type: "nfs", total: 12 * 1024 ** 4, used: 7.8 * 1024 ** 4, active: 1 },
];

const pveTasks = [
  { upid: "UPID:pve-lab:1001", node: "pve-node-1", user: "root@pam", type: "vzdump", status: "stopped", exitstatus: "OK", starttime: 1779772800 },
];

const pveMetrics = {
  data: Array.from({ length: 12 }, (_, index) => ({
    time: 1779772800 + index * 300,
    cpu: Number((0.3 + index * 0.02).toFixed(2)),
    mem: (28 + index) * 1024 ** 3,
    netin: (120 + index * 6) * 1024,
    netout: (90 + index * 5) * 1024,
  })),
};

const vcenterVms = [
  {
    moref: "vm-101",
    name: "prod-api-101",
    powerState: "poweredOn",
    guestFullName: "Ubuntu Linux (64-bit)",
    ipAddress: "10.0.20.101",
    cpu: 4,
    memoryMB: 8192,
  },
  {
    moref: "vm-102",
    name: "ops-db-102",
    powerState: "poweredOn",
    guestFullName: "Debian GNU/Linux",
    ipAddress: "10.0.20.102",
    cpu: 8,
    memoryMB: 16384,
  },
];

const vcenterHosts = [
  { moref: "host-101", name: "esxi-1", overallStatus: "green", connectionState: "connected", memoryTotalMB: 262144, memoryUsageMB: 78643, ip: "10.0.20.11" },
  { moref: "host-102", name: "esxi-2", overallStatus: "green", connectionState: "connected", memoryTotalMB: 262144, memoryUsageMB: 65900, ip: "10.0.20.12" },
];

const bastionTargets = [
  { id: "vcenter:vm-101", provider: "vcenter", name: "prod-api-101", moref: "vm-101", host: "10.0.20.101", port: 22, username: "ops", online: true },
  { id: "pve:pve-lab:pve-node-1:qemu:104", provider: "pve", name: "gpu-trainer-104", sourceId: "104", host: "10.0.30.104", port: 22, username: "root", online: true },
];

const demoDocs = [
  {
    id: 1,
    title: "Daily operations runbook",
    bodyMarkdown: "# Daily operations runbook\n\nCheck alerts, review capacity, and run safe maintenance from EasyPanel.",
    published: true,
    contentKind: "markdown",
    categoryId: 1,
    categoryName: "Runbooks",
    tagNames: ["ops", "runbook"],
    updatedAt: "2026-05-26T08:00:00+08:00",
    createdBy: "admin",
  },
];

const networkDevices = [
  {
    id: "ikuai-core",
    kind: "ikuai",
    name: "iKuai Core Router",
    prometheusScope: "router",
    instanceLabel: "ikuai-core",
    jobLabel: "network-exporter",
    updatedAt: "2026-05-26T09:20:00+08:00",
  },
  {
    id: "openwrt-edge",
    kind: "openwrt",
    name: "OpenWrt Edge Gateway",
    prometheusScope: "edge",
    instanceLabel: "openwrt-edge",
    jobLabel: "openwrt-exporter",
    host: "10.0.8.1",
    passwordSet: true,
    updatedAt: "2026-05-26T09:24:00+08:00",
  },
];

const openWrtExporterStatus = {
  prometheusConfigured: true,
  families: { system: true, interfaces: true, dhcp: true, wifi: true, netstat: true },
  missingHints: [],
  metricNames: ["node_load1", "openwrt_interface_rx_bytes", "openwrt_wifi_clients", "openwrt_conntrack_entries"],
};

const openWrtOverview = {
  board: { hostname: "openwrt-edge", model: "x86_64", release: { distribution: "OpenWrt", version: "23.05" } },
  system: { uptime: 345600, load: [0.08, 0.12, 0.18], memory: { total: 4 * 1024 ** 3, free: 2.6 * 1024 ** 3 } },
  network: { wan: { ipaddr: "203.0.113.10", proto: "dhcp" }, lan: { ipaddr: "10.0.8.1", proto: "static" } },
  checkedAt: "2026-05-26T08:00:00+08:00",
};

const openWrtInterfaces = {
  interfaces: [
    { interface: "lan", device: "br-lan", proto: "static", up: true, ipaddr: "10.0.8.1" },
    { interface: "wan", device: "eth0", proto: "dhcp", up: true, ipaddr: "203.0.113.10" },
  ],
  ipAddr: [
    { ifname: "br-lan", addr_info: [{ local: "10.0.8.1", prefixlen: 24 }] },
    { ifname: "eth0", addr_info: [{ local: "203.0.113.10", prefixlen: 24 }] },
  ],
  ipRoute: [{ target: "default", gateway: "203.0.113.1", dev: "eth0" }],
  source: "demo",
  checkedAt: "2026-05-26T08:00:00+08:00",
};

const openWrtClients = {
  leases: [
    { host: "node-01", ip: "10.0.8.12", mac: "02:00:00:00:08:12", expires: "11h", source: "dhcp" },
    { host: "ops-laptop", ip: "10.0.8.45", mac: "02:00:00:00:08:45", expires: "8h", source: "dhcp" },
  ],
  neighbors: [{ ip: "10.0.8.12", dev: "br-lan", mac: "02:00:00:00:08:12", state: "REACHABLE", source: "ip-neigh" }],
};

const openWrtWireless = {
  radios: [{ name: "radio0", channel: 6, band: "2g", disabled: false }],
  ifaces: [{ ifname: "wlan0", ssid: "EasyPanel-Lab", mode: "ap", network: "lan" }],
  stations: [{ interface: "wlan0", mac: "02:00:00:00:08:45", signal: -48, rxRate: 286, txRate: 240 }],
};

const openWrtFirewall = {
  conntrackCount: "148",
  firewallConfig: [
    { package: "firewall", section: "zone", option: "name", value: "lan" },
    { package: "firewall", section: "forwarding", option: "dest", value: "wan" },
  ],
  raw: { ruleset: "table inet fw4 { chain input { policy accept; } }" },
};

const ikuaiClientStream = {
  prometheusConfigured: true,
  exporterKind: "modern",
  checkedAt: "2026-05-26T08:00:00+08:00",
  devices: [
    { ip: "10.0.8.12", mac: "02:00:00:00:08:12", hostname: "node-01", comment: "K8s node", clientType: "server", download: 4_200_000, upload: 1_800_000, connections: 82 },
    { ip: "10.0.8.45", mac: "02:00:00:00:08:45", hostname: "ops-laptop", comment: "Ops laptop", clientType: "client", download: 2_100_000, upload: 740_000, connections: 34 },
  ],
};

const runtimeSettings = {
  ...appConfig,
  prometheusUrlK8s: "http://prometheus-operated.monitoring.svc:9090",
  prometheusUrlVcenter: "http://vmware-exporter.monitoring.svc:9272",
  prometheusUrlPve: "http://pve-exporter.monitoring.svc:9221",
  prometheusUrlNetwork: "http://network-exporter.monitoring.svc:9100",
  vmSelectUrlK8s: "",
  victoriaLogsUrl: "http://victoria-logs.observability.svc:9428",
};

const cloudVmBootstrap = {
  bootstrapComplete: true,
  defaultNamespace: "easy",
  defaultAccessNodeName: "node-01",
  images: [
    { id: "ubuntu-ssh", label: "Ubuntu SSH", image: "ghcr.io/ops-easy/cloud-vm:ubuntu-22.04", bakedInSSH: true },
    { id: "debian-ssh", label: "Debian SSH", image: "ghcr.io/ops-easy/cloud-vm:debian-12", bakedInSSH: true },
  ],
};

const cloudVmAccessNodes = {
  nodes: [
    { name: "node-01", internalIP: "10.0.8.12", externalIP: "203.0.113.10", schedulable: true },
    { name: "node-02", internalIP: "10.0.8.13", externalIP: "203.0.113.11", schedulable: true },
  ],
};

const cloudVmUsage = {
  prometheusConfigured: true,
  items: appInstances.cloudVm.slice(0, 4).map((instance, index) => ({
    id: instance.id,
    phase: "running",
    cpuPercent: 18 + index * 4,
    memPercent: 42 + index * 3,
    cpuUsageCores: Number((0.18 + index * 0.04).toFixed(2)),
    memUsageBytes: (512 + index * 128) * 1024 ** 2,
    cpuLimitCores: 2,
    memLimitBytes: 2 * 1024 ** 3,
    cpuQuery: `container_cpu_usage_seconds_total{pod=~"${instance.name}.*"}`,
    memQuery: `container_memory_working_set_bytes{pod=~"${instance.name}.*"}`,
  })),
};

const hermesBootstrap = {
  bootstrapComplete: true,
  defaultNamespace: "easy",
  defaultMode: "gateway-dashboard",
  defaultImage: "ghcr.io/stellar-hermes/hermes:latest",
  defaultStorageSize: "20Gi",
  defaultModelProvider: "openai",
  defaultModelName: "gpt-4o-mini",
  modes: [
    { id: "gateway", label: "Gateway", description: "API gateway only" },
    { id: "dashboard", label: "Dashboard", description: "Web dashboard only" },
    { id: "gateway-dashboard", label: "Gateway + Dashboard", description: "Combined runtime" },
  ],
};

function hermesK8sStatuses() {
  return {
    statuses: Object.fromEntries(
      appInstances.hermes.map((instance, index) => [
        instance.id,
        {
          k8sAvailable: true,
          deploymentFound: true,
          ready: true,
          readyReplicas: 1,
          desiredReplicas: 1,
          podName: `${instance.deploymentName}-65cb7d8f8c-${index + 1}`,
          podPhase: "Running",
          message: "demo Hermes runtime ready",
          serviceType: "ClusterIP",
          ports: [{ name: "http", port: 8080, targetPort: "8080", nodePort: instance.nodePort }],
        },
      ])
    ),
  };
}

function hermesFileResponse() {
  return {
    content: "model:\n  provider: openai\n  name: gpt-4o-mini\n",
    config: { provider: "openai", model: "gpt-4o-mini" },
  };
}

const promInstantResponse = {
  status: "success",
  data: { resultType: "vector", result: [{ metric: {}, value: [1779772800, "1"] }] },
};

const promRangeResponse = {
  status: "success",
  data: {
    resultType: "matrix",
    result: [
      {
        metric: {},
        values: Array.from({ length: 8 }, (_, index) => [1779772800 + index * 300, String(0.2 + index * 0.03)]),
      },
    ],
  },
};

function mockApiResponse(url, method = "GET") {
  const { pathname, searchParams } = new URL(url);
  if (method === "OPTIONS") return { status: 204, body: "" };
  if (method === "POST" && pathname === "/api/prometheus/query") return promInstantResponse;
  if (method === "POST" && pathname === "/api/prometheus/query_range") return promRangeResponse;
  if (method === "POST" && /^\/api\/app-center\/redis\/instances\/[^/]+\/ping$/.test(pathname)) {
    return { ok: true, latencyMs: 3, message: "demo redis reachable" };
  }

  if (pathname === "/api/setup/status") {
    return { initialized: true, dataDir: "/data", version: 1, configMode: "database" };
  }
  if (pathname === "/api/login/public-status") {
    return { initialized: true, authRequired: true, passwordLogin: true, oidcLogin: true, buildVersion: "demo-open-source" };
  }
  if (pathname === "/api/auth/status") {
    return {
      authRequired: true,
      loggedIn: true,
      username: "admin",
      role: "admin",
      permissions: appConfig.permissions,
      usersManagementEnabled: true,
      mysqlDsnConfigured: true,
      mysqlReachable: true,
      passwordLogin: true,
      oidcLogin: true,
      buildVersion: "demo-open-source",
    };
  }
  if (pathname === "/api/account/profile") {
    return {
      username: "admin",
      email: "admin@example.local",
      role: "admin",
      inDatabase: true,
      hasPassword: true,
      passwordLoginGlobal: true,
      oidcEnabled: true,
      oidcBound: true,
      avatarUrl: "",
    };
  }
  if (pathname === "/api/config") return appConfig;
  if (pathname === "/api/settings/runtime") return runtimeSettings;
  if (pathname === "/api/runtime/status") {
    return { config: appConfig, systemCheck, buildVersion: "demo-open-source", mysqlSchema: { configured: true, reachable: true, schemaAligned: true } };
  }
  if (pathname === "/api/admin/users") {
    return {
      users: [
        {
          id: 1,
          username: "admin",
          email: "admin@example.local",
          role: "admin",
          disabled: false,
          permissionsJson: JSON.stringify(appConfig.permissions),
          totpEnabled: true,
          totpConfigured: true,
          allowMultiIpLogin: true,
          oidcBound: true,
        },
        {
          id: 2,
          username: "ops",
          email: "ops@example.local",
          role: "operator",
          disabled: false,
          permissionsJson: JSON.stringify({ ...appConfig.permissions, appcenter: "ro" }),
          totpEnabled: false,
          totpConfigured: false,
          allowMultiIpLogin: false,
          allowedLoginIps: "10.0.8.0/24",
          oidcBound: false,
        },
      ],
    };
  }
  if (pathname === "/api/audit/logs") {
    return {
      logs: [
        {
          id: "audit-1",
          action: "login_ok",
          method: "POST",
          path: "/api/login",
          username: "admin",
          ip: "10.0.8.45",
          at: "2026-05-26T08:00:00+08:00",
          status: 200,
        },
        {
          id: "audit-2",
          action: "update",
          method: "PUT",
          path: "/api/settings/runtime",
          username: "admin",
          ip: "10.0.8.45",
          at: "2026-05-26T08:12:00+08:00",
          status: 200,
        },
      ],
      retentionDays: 30,
    };
  }
  if (pathname === "/api/audit/summary") {
    return { total: 2, today: 2, byAction: { login_ok: 1, update: 1 }, byModule: { auth: 1, other: 1 } };
  }
  if (pathname === "/api/audit/site-stats") {
    return {
      startedAt: "2026-06-01T08:00:00+08:00",
      totalHttpRequests: 128,
      topPaths: [
        { path: "/cluster/apps/dashboard", count: 42 },
        { path: "/cluster/compute/guests", count: 31 },
        { path: "/api/harbor/projects", count: 18 },
      ],
      topClientIPs: [
        { ip: "10.0.8.45", count: 64 },
        { ip: "10.0.8.12", count: 27 },
      ],
      loginFailsByIP: [{ ip: "10.0.8.99", count: 3 }],
      totalLoginFailIPs: 1,
      note: "render smoke demo site statistics",
    };
  }
  if (pathname === "/api/audit/harbor-dashboard") {
    return {
      platform: {
        harborProxyCalls: 36,
        cacheHits: 24,
        cacheMisses: 6,
        cacheTtlSec: 300,
        cacheMaxBodyMB: 4,
        harborListCacheEnabled: true,
        redisAvailable: true,
        cacheGeneration: 2,
        harborConfigured: true,
      },
      remoteStatistics: { total_project_count: 5, total_repo_count: 18 },
      remoteStatisticsFallback: false,
      harborUiUrl: "https://harbor.example.local",
      logs: [
        {
          ts: "2026-06-01T08:10:00+08:00",
          user: "admin",
          ip: "10.0.8.45",
          method: "GET",
          apiRoute: "/api/harbor/projects",
          harborPath: "/api/v2.0/projects",
          status: 200,
          durationMs: 42,
          fromCache: true,
        },
      ],
    };
  }
  if (pathname === "/api/host/egress-notification") {
    return { enabled: true, unread: 0, items: [] };
  }
  if (pathname === "/api/app-center/cloud-vm/ssh-security-events") {
    return { events: [] };
  }
  if (pathname === "/api/app-center/openclaw/gateway-service-health") {
    return {
      unread: 0,
      latest: null,
      items: [],
      summary: { healthy: true, total: 0, warning: 0, critical: 0 },
    };
  }
  if (pathname === "/api/ops/cluster-advisory") {
    return {
      ok: true,
      unread: 0,
      bellActive: false,
      acknowledged: true,
      severity: "ok",
      rating: "ok",
      summary: "demo cluster healthy",
      markdown: "Demo cluster advisory is healthy.",
      items: [],
      logPodsSampled: 0,
      prometheusConfigured: true,
      generatedAt: "2026-05-26T08:00:00+08:00",
      updatedAt: "2026-05-26T08:00:00+08:00",
    };
  }
  if (pathname === "/api/ops/monitoring/panels") return { panels: [] };
  if (pathname === "/api/ops/alerts") return { rules: [], channels: [] };
  if (pathname === "/api/ops/alerts/log") return { entries: [] };
  if (pathname === "/api/ops/ai-provider") {
    return {
      endpoint: {
        enabled: true,
        provider: "custom",
        baseUrl: "https://api.openai.com/v1",
        apiKeySet: true,
        model: "gpt-4o-mini",
        systemPrompt: "",
        userTemplate: "",
        timeoutSec: 120,
        skipTlsVerify: false,
        source: "custom",
        instanceId: "",
      },
      providerProfiles: {},
      ai: {
        dailyReportHour: 9,
        dailyReportMinute: 0,
        inspectK8s: true,
        inspectVCenter: true,
        inspectVCenterEvents: true,
        inspectPrometheus: true,
        inspectPrometheusK8s: true,
        inspectPrometheusVcenter: true,
        inspectPve: true,
        inspectPrometheusPve: true,
        inspectNetwork: true,
        inspectPrometheusNetwork: true,
        inspectVmLog: true,
        inspectRedis: true,
        inspectSSH: true,
        inspectCloudVm: true,
        modelExtra: { temperature: 0.2, maxTokens: 2048, topP: 1, frequencyPenalty: 0 },
      },
    };
  }
  if (pathname === "/api/ops/inspect/reports") {
    return {
      reports: [],
      total: 0,
      offset: Number(searchParams.get("offset") ?? 0),
      limit: Number(searchParams.get("limit") ?? 20),
    };
  }
  if (pathname === "/api/ops/inspect/tasks") return { tasks: [] };
  if (pathname === "/api/ops/vmlog/status") {
    return {
      configured: true,
      baseUrlHint: "http://eplogs-victoria-logs-single-server.easypanel-logging.svc:9428",
      defaultPort: 9428,
      docsUrl: "https://docs.victoriametrics.com/victorialogs/",
      helmChartsUrl: "https://docs.victoriametrics.com/helm/",
      discovered: [
        {
          namespace: "easypanel-logging",
          service: "eplogs-victoria-logs-single-server",
          suggestedUrl: "http://eplogs-victoria-logs-single-server.easypanel-logging.svc:9428",
          port: 9428,
          hint: "demo service",
        },
      ],
      retentionDays: 180,
      maxWindowMinutes: 259200,
      retentionHint: "demo retention 180 days",
      vmLogVectorDownloadConfigured: true,
      vmLogVectorDownloadBaseUrlHint: "https://packages.timber.io/vector",
      nginxGeoLiteConfigured: false,
      nginxGeoHint: "demo geo database not configured",
    };
  }
  if (pathname === "/api/ops/vmlog/namespaces") return { namespaces: data.namespaces.map((item) => item.name) };
  if (method === "POST" && pathname === "/api/ops/vmlog/overview") {
    return {
      windowMinutes: 1440,
      windowStart: "2026-05-25T08:00:00+08:00",
      windowEnd: "2026-05-26T08:00:00+08:00",
      refreshedAt: "2026-05-26T08:00:00+08:00",
      totalFetched: 128,
      items: [
        {
          scope: "pod",
          label: "Kubernetes Pod",
          status: "ok",
          hasError: false,
          priority: "low",
          priorityReason: "demo logs healthy",
          totalCount: 128,
          errorCount: 0,
          warnCount: 2,
          lastSeenAt: "2026-05-26T08:00:00+08:00",
        },
      ],
    };
  }
  if (method === "POST" && pathname === "/api/ops/vmlog/details") {
    return {
      scope: "pod",
      category: "all",
      windowMinutes: 1440,
      refreshedAt: "2026-05-26T08:00:00+08:00",
      totalFetched: 128,
      totalMatched: 1,
      page: 1,
      pageSize: 50,
      hasMore: false,
      summary: { status: "ok", hasError: false, priority: "low", totalCount: 1, errorCount: 0, warnCount: 0 },
      rows: [
        {
          time: "2026-05-26T08:00:00+08:00",
          scope: "pod",
          namespace: "easy",
          pod: "easypanel-api-7d98cdd7c8-n4p2z",
          msg: "demo request handled",
          status: "ok",
          hasError: false,
          priority: "low",
        },
      ],
    };
  }
  if (method === "POST" && pathname === "/api/ops/vmlog/stats") {
    return {
      category: "all",
      k8sNamespace: "",
      keyword: "",
      windowMinutes: 1440,
      bucketMinutes: 60,
      refreshedAt: "2026-05-26T08:00:00+08:00",
      totalFetched: 128,
      totalMatched: 1,
      matchedWithTs: 1,
      summary: { status: "ok", hasError: false, priority: "low", totalCount: 1, errorCount: 0, warnCount: 0 },
      buckets: [{ ts: 1779753600000, label: "08:00", count: 1 }],
      recent: [{ time: "2026-05-26T08:00:00+08:00", msg: "demo request handled", namespace: "easy", pod: "easypanel-api-7d98cdd7c8-n4p2z" }],
    };
  }
  if (pathname === "/api/ops/vmlog/vm-shipper/tasks") return { tasks: [] };
  if (pathname === "/api/k8s/pod-restart-ai/correlation-latest") {
    return { ok: true, source: "demo", doc: { title: "Demo pod restart correlation", body: "暂无异常 Pod 关联分析。", createdAt: "2026-05-26T08:00:00+08:00" } };
  }
  if (pathname === "/api/k8s/pod-restart-ai/rollup-summary") {
    return { ok: true, source: "demo", markdown: "暂无异常 Pod rollup。", meta: { demo: true } };
  }
  if (pathname === "/api/k8s/pod-restart-ai/reports") {
    return {
      ok: true,
      items: [],
      total: 0,
      offset: Number(searchParams.get("offset") ?? 0),
      limit: Number(searchParams.get("limit") ?? 15),
      kind: searchParams.get("kind") || "cluster",
    };
  }
  if (pathname === "/api/k8s/prometheus/cluster-snapshot") {
    return {
      scalars: {
        cpu_usage_cores: 18.4,
        alloc_cpu_cores: 64,
        req_cpu_cores: 31.2,
        mem_wss_bytes: 72 * 1024 ** 3,
        alloc_mem_bytes: 256 * 1024 ** 3,
        req_mem_bytes: 128 * 1024 ** 3,
        pods_running: 426,
        pods_allocatable: 880,
        fs_size_bytes: 8 * 1024 ** 4,
        fs_avail_bytes: 2.2 * 1024 ** 4,
      },
      coreUp: { apiserver: 1, scheduler: 1, controller: 1, kubelet: 1 },
      legacy: { upSeries: 128, tsdbSeries: 240000 },
      topk: {
        namespaceCpu: [{ metric: { namespace: "easy" }, value: 4.2 }],
        namespaceMem: [{ metric: { namespace: "observability" }, value: 12 * 1024 ** 3 }],
        podCpu: [{ metric: { namespace: "easy", pod: "easypanel-api-7d98cdd7c8-n4p2z" }, value: 0.42 }],
        podMem: [{ metric: { namespace: "easy", pod: "mysql-primary-0" }, value: 2.2 * 1024 ** 3 }],
      },
      cachedAt: "2026-05-26T08:00:00+08:00",
      warming: false,
    };
  }
  if (pathname === "/api/k8s/prometheus/pod-network-top") {
    return {
      topN: 10,
      windows: {
        "1d": {
          pods: [
            {
              namespace: "easy",
              pod: "easypanel-api-7d98cdd7c8-n4p2z",
              receiveBytes: 14 * 1024 ** 3,
              transmitBytes: 9 * 1024 ** 3,
              totalBytes: 23 * 1024 ** 3,
              tcpConnections: 42,
            },
          ],
        },
      },
      tcpConnectionsAvailable: true,
      trafficMetrics: ["container_network_receive_bytes_total", "container_network_transmit_bytes_total"],
    };
  }
  if (pathname === "/api/k8s/prometheus/cluster-charts") {
    const chart = Array.from({ length: 12 }, (_, index) => ({ x: (1779772800 + index * 3600) * 1000, v: 10 + index }));
    return {
      days: Number(searchParams.get("days") ?? 7),
      cachedAt: "2026-05-26T08:00:00+08:00",
      warming: false,
      rows: [
        {
          id: "cpu_usage",
          section: "usage",
          title: "CPU usage",
          subtitle: "demo cluster",
          chart,
          usedQuery: "sum(rate(container_cpu_usage_seconds_total[5m]))",
          valueFormat: "cores",
          accent: "#0ea5e9",
          missingHint: "",
        },
      ],
    };
  }
  if (pathname === "/api/k8s/resource-relations") {
    return {
      namespace: searchParams.get("namespace") || "easy",
      kind: searchParams.get("kind") || "Pod",
      name: searchParams.get("name") || "easypanel-api",
      relations: [],
      graph: { nodes: [], edges: [] },
    };
  }
  if (pathname === "/api/k8s/summary") {
    return {
      namespaceCount: data.namespaces.length,
      podCount: data.clusters.reduce((sum, cluster) => sum + cluster.pods, 0),
      serviceCount: 43,
      nodeCount: data.clusters.reduce((sum, cluster) => sum + cluster.nodes, 0),
      podsRunning: 426,
      podsFailed: 1,
      podsPending: 2,
      podsCrashLoop: 1,
      nodesNotReady: 0,
      anomalyPods: [
        { namespace: "lab-gpu", name: "training-worker-7c6fd", phase: "Pending", reason: "GPUQuota" },
        { namespace: "observability", name: "opensearch-hot-2", phase: "Running", reason: "Restarted" },
      ],
    };
  }
  if (pathname === "/api/k8s/namespace-stats") {
    return {
      computedAt: "2026-05-26T08:00:00+08:00",
      items: data.namespaces.map((namespace) => ({
        namespace: namespace.name,
        podCount: namespace.pods,
        deploymentCount: Math.max(1, Math.round(namespace.workloads * 0.55)),
        statefulSetCount: namespace.name === "easy" ? 2 : 1,
        serviceCount: Math.max(1, Math.round(namespace.workloads * 0.35)),
        pvcCount: namespace.name === "easy" ? 3 : 1,
        namespaceCreated: "2026-05-20T08:00:00+08:00",
        latestObjectCreated: "2026-05-26T08:00:00+08:00",
      })),
    };
  }
  if (pathname === "/api/k8s/pods") {
    const namespace = searchParams.get("namespace");
    return namespace ? pods.filter((pod) => pod.namespace === namespace) : pods;
  }
  if (pathname === "/api/k8s/deployments") return namespaceRows(k8sWorkloads.deployments, searchParams.get("namespace"));
  if (pathname === "/api/k8s/statefulsets") return namespaceRows(k8sWorkloads.statefulsets, searchParams.get("namespace"));
  if (pathname === "/api/k8s/daemonsets") return namespaceRows(k8sWorkloads.daemonsets, searchParams.get("namespace"));
  if (pathname === "/api/k8s/services") return namespaceRows(k8sServices, searchParams.get("namespace"));
  if (pathname === "/api/k8s/ingresses") return namespaceRows(k8sIngresses, searchParams.get("namespace"));
  if (pathname === "/api/k8s/pvcs") return namespaceRows(k8sPvcs, searchParams.get("namespace"));
  if (pathname === "/api/k8s/configmaps") return namespaceRows(k8sConfigMaps, searchParams.get("namespace"));
  if (pathname === "/api/k8s/secrets") return namespaceRows(k8sSecrets, searchParams.get("namespace"));
  if (pathname === "/api/k8s/object-yaml") {
    return demoObjectYaml(searchParams.get("kind") || "Object", searchParams.get("namespace") || "easy", searchParams.get("name") || "demo");
  }
  if (pathname === "/api/k8s/pvc-files/easy/data-easypanel-api/mounts") {
    return { mounts: [{ pod: "easypanel-api-7d98cdd7c8-n4p2z", container: "api", mountPath: "/data" }] };
  }
  if (pathname === "/api/k8s/pvc-files/easy/data-easypanel-api/list") {
    return { path: searchParams.get("path") || "", entries: [{ name: "config.yaml", type: "file", size: 512 }, { name: "logs", type: "dir", size: 0 }] };
  }
  {
    const podDetailMatch = pathname.match(/^\/api\/k8s\/pods\/([^/]+)\/([^/]+)$/);
    if (podDetailMatch) {
      const namespace = decodeURIComponent(podDetailMatch[1]);
      const podName = decodeURIComponent(podDetailMatch[2]);
      const pod = pods.find((item) => item.namespace === namespace && item.name === podName) ?? pods[0];
      return demoPodDetail(pod);
    }
  }
  if (pathname === "/api/k8s/pods/metrics") return podMetrics;
  if (pathname === "/api/k8s/pods/resource-efficiency") {
    return { ok: true, prometheus: true, scannedRunningPods: pods.length, missingLimitsPods: 2, slackShown: 3, rows: [] };
  }
  if (pathname === "/api/k8s/workloads/resource-advisory") return { ok: true, prometheus: true, rows: [] };
  if (pathname === "/api/k8s/pod-restart-insights") return { ok: true, items: [] };
  if (pathname === "/api/k8s/pod-restarts") return { ok: true, minRestarts: 1, items: [] };
  if (pathname === "/api/k8s/nodes") {
    return {
      nodes: data.clusters.flatMap((cluster) =>
        Array.from({ length: Math.min(cluster.nodes, 3) }, (_, index) => ({
          name: `${cluster.name}-node-${index + 1}`,
          ready: "True",
          roles: index === 0 ? ["control-plane"] : ["worker"],
          internalIP: `10.0.${index + 8}.${index + 10}`,
          kubelet: "v1.30.2",
          age: `${index + 11}d`,
          cpuAllocCores: 8,
          memAllocBytes: 32 * 1024 ** 3,
          cpuUsagePercent: cluster.cpu,
          memUsagePercent: cluster.memory,
          podCount: Math.round(cluster.pods / Math.max(cluster.nodes, 1)),
        }))
      ),
      prometheusConfigured: true,
    };
  }
  if (pathname === "/api/k8s/etcd/summary") {
    return {
      queriedAt: "2026-05-26T08:00:00+08:00",
      prometheusConfigured: true,
      etcdUp: 3,
      walFsyncP99Seconds: 0.012,
      walFsyncP99Ms: 12,
      walFsyncAlert: false,
      leaderChanges15m: 0,
      leaderChanges1h: 1,
      leaderChangeAlert: false,
      mvccDbSizeBytes: 2.2 * 1024 ** 3,
      processRSSBytes: 1.1 * 1024 ** 3,
      proposalsPending: 0,
      dbSizeByInstance: [],
      leaderChangesThreshold: 5,
      walP99AlertThresholdMs: 100,
    };
  }
  if (pathname === "/api/k8s/rbac") {
    return {
      clusterRoles: [{ name: "cluster-admin", rulesCount: 12, age: "30d" }],
      clusterRoleBindings: [{ name: "cluster-admin", roleRef: "ClusterRole/cluster-admin", subjects: "admin", age: "30d" }],
      roles: [{ namespace: "easy", name: "viewer", rulesCount: 3, age: "12d" }],
      roleBindings: [{ namespace: "easy", name: "viewer", roleRef: "Role/viewer", subjects: "ops", age: "12d" }],
      serviceAccounts: [{ namespace: "easy", name: "easypanel", age: "12d" }],
      warnings: [],
    };
  }
  {
    const saMatch = pathname.match(/^\/api\/k8s\/rbac\/service-accounts\/([^/]+)\/([^/]+)$/);
    if (saMatch) {
      const namespace = decodeURIComponent(saMatch[1]);
      const name = decodeURIComponent(saMatch[2]);
      return {
        serviceAccount: {
          namespace,
          name,
          uid: "demo-sa-uid",
          createdAt: "2026-05-20T08:00:00+08:00",
          labels: { app: name },
          annotations: {},
        },
        clusterRoleBindings: [{ name: `${name}-cluster-read`, roleRef: "ClusterRole/view", subjects: `ServiceAccount/${namespace}/${name}` }],
        roleBindings: [{ namespace, name: `${name}-edit`, roleRef: "Role/edit", subjects: `ServiceAccount/${namespace}/${name}` }],
        tokenSecrets: [{ name: `${name}-token`, hasToken: true, age: "10d" }],
      };
    }
  }
  if (pathname === "/api/k8s/crds") {
    return {
      items: [
        {
          name: "certificates.cert-manager.io",
          group: "cert-manager.io",
          kind: "Certificate",
          plural: "certificates",
          scope: "Namespaced",
          storageVersion: "v1",
          createdAt: "2026-05-20T08:00:00+08:00",
          established: true,
        },
      ],
    };
  }
  {
    const crListMatch = pathname.match(/^\/api\/k8s\/crds\/([^/]+)\/instances$/);
    if (crListMatch) {
      const crd = decodeURIComponent(crListMatch[1]);
      return {
        gvr: { group: "cert-manager.io", version: "v1", resource: "certificates" },
        scope: "Namespaced",
        items: [{ namespace: "easy", name: "demo-cert", createdAt: "2026-05-26T08:00:00+08:00" }],
        crd,
      };
    }
    const crOneMatch = pathname.match(/^\/api\/k8s\/crds\/([^/]+)\/instances\/([^/]+)\/([^/]+)$/);
    if (crOneMatch) {
      const namespace = decodeURIComponent(crOneMatch[2]);
      return {
        object: demoCustomResource,
        createdAt: demoCustomResource.metadata.creationTimestamp,
        related: {
          ownerReferences: demoCustomResource.metadata.ownerReferences,
          eventsNamespace: namespace,
          events: [
            {
              type: "Normal",
              reason: "Issued",
              message: "Certificate issued successfully",
              count: 1,
            },
          ],
        },
        warnings: [],
        crd: decodeURIComponent(crOneMatch[1]),
      };
    }
  }
  if (pathname === "/api/k8s/addons/status") {
    return {
      checkedAt: "2026-05-26T08:00:00+08:00",
      manifestMirror: {
        effective: "ghproxy_preferred",
        hint: "demo manifest mirror is ready",
      },
      ingressNginxK8sRegistryMirror: true,
      ingressNginx: {
        namespace: "ingress-nginx",
        namespaceExists: true,
        podTotal: 2,
        podReady: 2,
        installed: true,
        likelyInstalled: true,
        controllersLikelyReady: true,
        controllerServiceType: "ClusterIP",
        serviceMissing: false,
        hostNetwork: true,
        deploymentHttpPort: 80,
        deploymentHttpsPort: 443,
        desiredHostHttpPort: 80,
        desiredHostHttpsPort: 443,
        deploymentMetricsPort: 10254,
        hostPortsMatchDesired: true,
        deploymentControllerNodeName: "homelab-prod-node-1",
        desiredControllerNodeName: "homelab-prod-node-1",
        controllerNodeMatchDesired: true,
      },
      metricsServer: {
        namespace: "kube-system",
        installed: true,
        deploymentReady: true,
        apiServiceReady: true,
        hint: "demo metrics-server ready",
      },
      kubernetesDashboard: {
        namespace: "kubernetes-dashboard",
        releaseName: "kubernetes-dashboard",
        installed: true,
        namespaceExists: true,
        kongProxyServiceReady: true,
        webDeploymentReady: true,
        apiDeploymentReady: true,
        authDeploymentReady: true,
        hint: "demo dashboard ready",
      },
      kubePrometheusStack: {
        namespace: "easypanel-monitoring",
        releaseName: "kbt-prom",
        installed: true,
        namespaceExists: true,
        operatorDeploymentReady: true,
        prometheusStatefulSet: "prometheus-kbt-prom-kube-prometheus-prometheus",
        prometheusReady: true,
        alertmanagerStatefulSet: "alertmanager-kbt-prom-kube-prometheus-alertmanager",
        alertmanagerReady: true,
        podWarnings: [],
        discoveredPrometheusURL: "http://kbt-prom-kube-prometheus-prometheus.easypanel-monitoring.svc:9090",
        prometheusMetricsProbe: {
          ok: true,
          kubeNodeInfoCount: 3,
          detail: "demo query ok",
          syncRecommended: false,
        },
        runtimePrometheusURLMasked: "http://kbt-prom-kube-prometheus-prometheus.easypanel-monitoring.svc:9090",
        runtimePrometheusURLSource: "kube-prometheus-stack",
        runtimePrometheusURLMatchesDiscovered: true,
        runtimePrometheusURLSyncRecommended: false,
        runtimePrometheusUsesVMSelect: false,
      },
      victoriaLogs: {
        namespace: "easypanel-logging",
        releaseName: "eplogs",
        serviceName: "eplogs-victoria-logs-single-server",
        internalUrl: "http://eplogs-victoria-logs-single-server.easypanel-logging.svc:9428",
        installed: true,
        statefulSetReady: true,
        runtimeUrlHint: "http://eplogs-victoria-logs-single-server.easypanel-logging.svc:9428",
        collectorInstallHint: "demo collector installed",
        datasourceBoundaryHint: "demo datasource is isolated",
      },
    };
  }
  if (pathname === "/api/harbor/status") {
    return {
      configured: true,
      reachable: true,
      harborUiUrl: "https://harbor.easypanel.dev",
      systeminfo: { harbor_version: "v2.11.0", external_url: "https://harbor.easypanel.dev" },
    };
  }
  if (pathname === "/api/harbor/index/status") {
    return {
      redisAvailable: true,
      indexReady: true,
      entryCount: 3,
      meta: { updatedAt: "2026-05-26T08:00:00+08:00", projectCount: 2, repoCount: 3, tagCount: 8 },
    };
  }
  if (pathname === "/api/harbor/statistics") {
    return { total_project_count: 2, total_repo_count: 3, total_storage_consumption: 8 * 1024 ** 3 };
  }
  if (pathname === "/api/harbor/projects") {
    return [
      { name: "library", project_id: 1, repo_count: 2, metadata: { public: "false" } },
      { name: "observability", project_id: 2, repo_count: 1, metadata: { public: "false" } },
    ];
  }
  if (/^\/api\/harbor\/projects\/[^/]+\/repositories$/.test(pathname)) return harborDemoRepositories;
  if (/^\/api\/harbor\/projects\/[^/]+\/artifacts$/.test(pathname)) return harborDemoArtifacts;
  if (/^\/api\/harbor\/projects\/[^/]+\/artifact-additions$/.test(pathname)) {
    return { history: [{ created_by: "demo", created: "2026-05-26T08:00:00+08:00", command: "RUN npm run build" }] };
  }
  if (pathname === "/api/namespaces") return data.namespaces.map((namespace) => namespace.name);
  if (pathname === "/api/services") {
    return [
      { namespace: "easy", name: "easypanel-web", ports: [80, 443] },
      { namespace: "easy", name: "easypanel-api", ports: [8080] },
      { namespace: "app-prod", name: "orders-api", ports: [8080, 9090] },
      { namespace: "observability", name: "victoria-logs", ports: [3100] },
    ];
  }
  if (pathname === "/api/docs") {
    return { docs: demoDocs.map(({ bodyMarkdown: _body, ...doc }) => doc) };
  }
  {
    const docDetailMatch = pathname.match(/^\/api\/docs\/(\d+)$/);
    if (docDetailMatch) {
      const id = Number(docDetailMatch[1]);
      const doc = demoDocs.find((item) => item.id === id) ?? demoDocs[0];
      return { ...doc, bodyMarkdown: doc.bodyMarkdown };
    }
    const docVersionsMatch = pathname.match(/^\/api\/docs\/(\d+)\/versions$/);
    if (docVersionsMatch) {
      return { versions: [{ versionNo: 1, title: "Initial", createdBy: "admin", createdAt: "2026-05-26T08:00:00+08:00" }] };
    }
  }
  if (pathname === "/api/docs/categories") return { categories: [{ id: 1, name: "Runbooks" }] };
  if (pathname === "/api/docs/attachment-storage") {
    return {
      mode: "local",
      cos: { configured: false, bucket: "", region: "", prefix: "docs/", publicBase: "", source: "demo" },
      configureHint: "demo local document storage",
      canManageKv: true,
    };
  }
  if (pathname === "/api/docs/media") return { items: [] };
  if (pathname === "/api/ingresses") return ingressRows;
  if (pathname === "/api/status") {
    return ingressRows.map((ingress) => ({
      namespace: ingress.namespace,
      name: ingress.name,
      domain: ingress.hosts[0],
      ddnsPort: ingress.ddnsPort,
      upstreamHost: ingress.upstreamHost,
      createdAt: ingress.createdAt,
      modifiedAt: ingress.modifiedAt,
      version: "networking.k8s.io/v1",
      scheme: ingress.scheme,
      status: "synced",
    }));
  }
  if (pathname === "/api/baota/ingress-sync/status") {
    return {
      report: {
        running: false,
        trigger: "demo",
        startedAt: "2026-05-26T09:00:00+08:00",
        finishedAt: "2026-05-26T09:00:02+08:00",
        summary: "3 demo ingress rules synced",
        domains: data.ingresses.map((ingress) => ({
          domain: ingress.host,
          overallOk: true,
          targetUrl: `${ingress.provider}:${ingress.upstream}`,
          steps: [{ name: "ensure-site", ok: true, attempts: 1 }],
          ingressNamespace: ingress.namespace,
          ingressName: `${ingress.host.split(".")[0]}-ingress`,
        })),
      },
    };
  }
  if (pathname === "/api/app-center/redis/status") return { mysqlReachable: true, encryptionReady: true, mirrorRedisOk: true, dualWriteRedis: true };
  if (pathname === "/api/app-center/redis/instances") return { instances: appInstances.redis };
  if (/^\/api\/app-center\/redis\/instances\/[^/]+\/k8s-status$/.test(pathname)) {
    return { phase: "Running", summary: "demo redis pod ready" };
  }
  if (/^\/api\/app-center\/redis\/instances\/[^/]+\/keys$/.test(pathname)) return { keys: [] };
  if (/^\/api\/app-center\/redis\/instances\/[^/]+\/clients$/.test(pathname)) return { clients: [] };
  if (/^\/api\/app-center\/redis\/instances\/[^/]+\/bigkeys$/.test(pathname)) return { keys: [] };
  if (pathname === "/api/app-center/mysql/status") {
    return { mysqlReachable: true, encryptionReady: true, k8sReady: true };
  }
  if (pathname === "/api/app-center/mysql/templates") {
    return {
      templates: [
        {
          id: 1,
          name: "default-mysql",
          description: "Demo MySQL 8 template",
          config: {
            mysqlImage: "mysql:8.4",
            exporterImage: "prom/mysqld-exporter:v0.15.1",
            defaultVersion: "8.4",
            defaultStorageSize: "20Gi",
            defaultEnableExporter: true,
          },
        },
      ],
    };
  }
  if (pathname === "/api/app-center/mysql/instances") return { instances: appInstances.mysql };
  if (pathname === "/api/app-center/kafka/status") return { mysqlReachable: true, k8sReady: true };
  if (pathname === "/api/app-center/kafka/templates") {
    return {
      templates: [
        {
          id: 1,
          name: "default-kafka",
          description: "Demo Kafka KRaft template",
          config: { kafkaImage: "bitnami/kafka:3.8", replicas: 3, storageSize: "100Gi" },
        },
      ],
    };
  }
  if (pathname === "/api/app-center/kafka/instances") return { instances: appInstances.kafka };
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/rollout$/.test(pathname)) {
    return {
      clusterReady: true,
      namespace: "app-prod",
      baseName: "kafka-1",
      zkDesired: 3,
      zkReady: 3,
      kafkaDesired: 3,
      kafkaReady: 3,
      message: "demo Kafka cluster ready",
      prometheusConfigured: true,
      cpuUsageCores: 1.4,
      memUsageBytes: 6 * 1024 ** 3,
      saslMechanism: "SCRAM-SHA-512",
    };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/exposure$/.test(pathname)) {
    return {
      externalExposure: "nodeport",
      externalAdvertiseHost: "edge.easypanel.dev",
      externalNodePorts: [32092, 32093, 32094],
      kafkaReplicas: 3,
      services: [
        { ordinal: 0, name: "kafka-1-kafka-0-external", found: true, nodePort: 32092, targetPort: 9094 },
        { ordinal: 1, name: "kafka-1-kafka-1-external", found: true, nodePort: 32093, targetPort: 9094 },
        { ordinal: 2, name: "kafka-1-kafka-2-external", found: true, nodePort: 32094, targetPort: 9094 },
      ],
      externalBootstrap: "edge.easypanel.dev:32092,edge.easypanel.dev:32093,edge.easypanel.dev:32094",
      externalListenerPort: 9094,
      accessEndpoints: [
        { broker: 0, host: "edge.easypanel.dev", nodePort: 32092 },
        { broker: 1, host: "edge.easypanel.dev", nodePort: 32093 },
        { broker: 2, host: "edge.easypanel.dev", nodePort: 32094 },
      ],
    };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/topics$/.test(pathname)) {
    return { topics: [{ topic: "orders" }, { topic: "events" }, { topic: "__consumer_offsets" }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/consumer-groups$/.test(pathname)) {
    return { groups: [{ groupId: "orders-api", state: "Stable", members: 3 }, { groupId: "billing-worker", state: "Stable", members: 1 }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/consumer-group-lag$/.test(pathname)) {
    return { group: searchParams.get("group") || "orders-api", rows: [{ topic: "orders", partition: 0, currentOffset: 1200, logEndOffset: 1203, lag: 3 }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/acls$/.test(pathname)) {
    return { acls: [{ principal: "User:admin", host: "*", operation: 3, permissionType: 3, resourceType: 2, resourceName: "orders", resourcePatternType: 3 }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/quotas$/.test(pathname)) {
    return { quotas: [{ user: "admin", producerByteRate: 1048576, consumerByteRate: 1048576 }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/topics\/[^/]+\/throttle$/.test(pathname)) {
    return { throttle: { leaderReplicationThrottledRate: -1, followerReplicationThrottledRate: -1 } };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/cluster$/.test(pathname)) {
    return { brokers: [{ id: 0, host: "kafka-1-kafka-0", port: 9092 }, { id: 1, host: "kafka-1-kafka-1", port: 9092 }], controllerId: 0 };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/topics\/[^/]+\/configs$/.test(pathname)) {
    return { configs: [{ name: "retention.ms", value: "604800000", source: "DYNAMIC_TOPIC_CONFIG" }] };
  }
  if (/^\/api\/app-center\/kafka\/instances\/[^/]+\/perf-tests$/.test(pathname)) {
    return { jobs: [] };
  }
  if (pathname === "/api/app-center/opensearch/status") return { mysqlReachable: true, k8sReady: true };
  if (pathname === "/api/app-center/opensearch/templates") {
    return {
      templates: [
        {
          id: 1,
          name: "default-opensearch",
          description: "Demo OpenSearch hot node template",
          config: { image: "opensearchproject/opensearch:2.15.0", storageSize: "200Gi" },
        },
      ],
    };
  }
  if (pathname === "/api/app-center/opensearch/instances") return { instances: appInstances.opensearch };
  if (pathname === "/api/app-center/cloud-vm/bootstrap") return cloudVmBootstrap;
  if (pathname === "/api/app-center/cloud-vm/access-nodes") return cloudVmAccessNodes;
  if (pathname === "/api/app-center/cloud-vm/instances/usage") return cloudVmUsage;
  if (pathname === "/api/app-center/cloud-vm/instances") return { instances: appInstances.cloudVm };
  if (/^\/api\/app-center\/cloud-vm\/instances\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/").at(-1);
    return { instance: appInstances.cloudVm.find((item) => String(item.id) === id) ?? appInstances.cloudVm[0] };
  }
  if (/^\/api\/app-center\/cloud-vm\/instances\/[^/]+\/metrics$/.test(pathname)) {
    return { prometheusConfigured: true, cpu: promRangeResponse, memory: promRangeResponse };
  }
  if (pathname === "/api/app-center/openclaw/bootstrap") {
    return {
      bootstrapComplete: true,
      defaultNamespace: "easy",
      defaultRbacPreset: "readonly",
      modes: openClawModePresets,
    };
  }
  if (pathname === "/api/app-center/openclaw/image-catalog") return openClawImageCatalogResponse;
  if (pathname === "/api/app-center/openclaw/rbac-presets") return { presets: openClawRBACPresets };
  if (pathname === "/api/app-center/openclaw/toolchain-options") return openClawToolchainOptions;
  if (pathname === "/api/app-center/openclaw/instances/k8s-status") return openClawK8sStatuses();
  if (/^\/api\/app-center\/openclaw\/instances\/[^/]+\/file$/.test(pathname)) return openClawFileResponse(url);
  if (pathname === "/api/app-center/openclaw/instances") return { instances: appInstances.openclaw };
  if (pathname === "/api/app-center/hermes/bootstrap") return hermesBootstrap;
  if (pathname === "/api/app-center/hermes/instances/k8s-status") return hermesK8sStatuses();
  if (/^\/api\/app-center\/hermes\/instances\/[^/]+\/file$/.test(pathname)) return hermesFileResponse();
  if (/^\/api\/app-center\/hermes\/instances\/[^/]+\/logs$/.test(pathname)) {
    return { logs: [{ ts: "2026-05-26T08:00:00+08:00", line: "Hermes demo gateway started", level: "info" }] };
  }
  if (/^\/api\/app-center\/hermes\/instances\/[^/]+\/events$/.test(pathname)) {
    return { events: [{ type: "Normal", reason: "Ready", message: "Deployment is available", age: "2m" }] };
  }
  if (/^\/api\/app-center\/hermes\/instances\/[^/]+$/.test(pathname)) {
    const id = pathname.split("/").at(-1);
    return { instance: appInstances.hermes.find((item) => item.id === id) ?? appInstances.hermes[0] };
  }
  if (pathname === "/api/app-center/hermes/instances") return { instances: appInstances.hermes };
  if (pathname === "/api/dns/status") return { configured: true, healthy: true, providers: ["cloudflare", "dnspod"] };
  if (pathname === "/api/dns/accounts") {
    return {
      accounts: [
        { id: 1, name: "Cloudflare demo", provider: "cloudflare", remark: "demo", createdBy: "demo", createdAt: "2026-05-26T08:00:00+08:00" },
        { id: 2, name: "DNSPod demo", provider: "dnspod", remark: "demo", createdBy: "demo", createdAt: "2026-05-26T08:00:00+08:00" },
      ],
    };
  }
  if (pathname === "/api/dns/domains") {
    return {
      domains: [
        { id: 1, name: "easypanel.dev", accountId: 1, accountName: "Cloudflare demo", provider: "cloudflare" },
        { id: 2, name: "ops-easy.dev", accountId: 2, accountName: "DNSPod demo", provider: "dnspod" },
        { id: 3, name: "lab.easypanel.dev", accountId: 1, accountName: "Cloudflare demo", provider: "cloudflare" },
      ],
    };
  }
  const dnsRecordListMatch = pathname.match(/^\/api\/dns\/domains\/([^/]+)\/records$/);
  if (dnsRecordListMatch) {
    return {
      records: [
        {
          id: "rec-main",
          domainId: Number(dnsRecordListMatch[1]) || 1,
          recordType: "A",
          host: "@",
          line: "default",
          value: "1.1.1.1",
          ttl: 600,
          mxPriority: 0,
          status: 1,
          remark: "render smoke",
        },
        {
          id: "rec-www",
          domainId: Number(dnsRecordListMatch[1]) || 1,
          recordType: "CNAME",
          host: "www",
          line: "default",
          value: "easypanel.dev",
          ttl: 600,
          mxPriority: 0,
          status: 1,
          remark: "render smoke",
        },
      ],
    };
  }
  if (pathname === "/api/dns/failover") {
    return {
      tasks: [
        {
          id: 1,
          name: "主站 HTTP",
          domainId: 1,
          domainName: "easypanel.dev",
          recordId: "rec-main",
          checkType: "https",
          checkTarget: "easypanel.dev",
          checkPort: 443,
          checkPath: "/",
          checkInterval: 60,
          checkTimeout: 10,
          maxErrors: 3,
          failoverValue: "2.2.2.2",
          originalValue: "1.1.1.1",
          status: 1,
          errorCount: 0,
          lastCheckAt: "2026-05-26T08:00:00+08:00",
          lastStatus: "ok",
          createdBy: "demo",
          createdAt: "2026-05-20T08:00:00+08:00",
        },
      ],
    };
  }
  if (/^\/api\/dns\/failover\/[^/]+\/logs$/.test(pathname)) {
    return {
      logs: [
        {
          id: 1,
          taskId: 1,
          action: "check_ok",
          oldValue: "",
          newValue: "",
          message: "HTTP 检测成功，解析保持正常",
          createdAt: "2026-05-26T08:00:00+08:00",
        },
      ],
    };
  }
  if (pathname === "/api/dns/scheduled") {
    return {
      tasks: [
        {
          id: 1,
          name: "夜间切换主站 A 记录",
          domainId: 1,
          domainName: "easypanel.dev",
          recordId: "rec-main",
          action: "modify",
          newValue: "2.2.2.2",
          scheduledAt: "2026-05-30T02:00:00+08:00",
          status: "pending",
          executedAt: null,
          message: "",
          createdBy: "demo",
          createdAt: "2026-05-26T08:00:00+08:00",
        },
      ],
    };
  }
  if (pathname === "/api/dns/certs") {
    return {
      certs: [
        {
          id: 1,
          name: "主站通配符证书",
          accountId: 1,
          domains: JSON.stringify(["easypanel.dev", "*.easypanel.dev"]),
          email: "admin@easypanel.dev",
          status: "issued",
          issuedAt: "2026-05-20T08:00:00+08:00",
          expireAt: "2026-08-18T08:00:00+08:00",
          autoRenew: true,
          baotaSiteName: "easypanel.dev",
          autoPushBaota: true,
          createdBy: "demo",
          createdAt: "2026-05-20T08:00:00+08:00",
        },
      ],
    };
  }
  if (pathname === "/api/vcenter/vms") {
    return { vms: vcenterVms };
  }
  if (/^\/api\/vcenter\/vms\/[^/]+\/quickstats$/.test(pathname)) {
    return {
      overallCpuUsage: 840,
      guestMemoryUsage: 2048,
      hostMemoryUsage: 4096,
      uptimeSeconds: 86400,
      powerState: "poweredOn",
    };
  }
  if (/^\/api\/vcenter\/vms\/[^/]+\/netperf$/.test(pathname)) {
    return {
      samples: [
        { time: "2026-05-26T08:00:00+08:00", rxBps: 125000, txBps: 98000 },
        { time: "2026-05-26T08:05:00+08:00", rxBps: 142000, txBps: 104000 },
      ],
    };
  }
  if (/^\/api\/vcenter\/vms\/[^/]+$/.test(pathname)) {
    const moref = pathname.split("/").at(-1);
    return vcenterVms.find((vm) => vm.moref === moref) ?? vcenterVms[0];
  }
  if (pathname === "/api/vcenter/hosts") {
    return { hosts: vcenterHosts };
  }
  if (/^\/api\/vcenter\/hosts\/[^/]+$/.test(pathname)) {
    const moref = pathname.split("/").at(-1);
    return vcenterHosts.find((hostItem) => hostItem.moref === moref || hostItem.name === moref) ?? vcenterHosts[0];
  }
  if (pathname === "/api/pve/targets") return { targets: pveTargets };
  if (/^\/api\/pve\/targets\/[^/]+\/summary$/.test(pathname)) return { nodes: pveNodes, guests: pveGuests, storage: pveStorage };
  if (/^\/api\/pve\/targets\/[^/]+\/nodes$/.test(pathname)) return { nodes: pveNodes };
  if (/^\/api\/pve\/targets\/[^/]+\/nodes\/[^/]+$/.test(pathname)) {
    const node = pathname.split("/").at(-1);
    return { status: pveNodes.find((item) => item.node === node) ?? pveNodes[0], version: { version: "8.2.4", release: "demo" } };
  }
  if (/^\/api\/pve\/targets\/[^/]+\/nodes\/[^/]+\/metrics$/.test(pathname)) return { metrics: pveMetrics };
  if (/^\/api\/pve\/targets\/[^/]+\/guests$/.test(pathname)) return { guests: pveGuests };
  if (/^\/api\/pve\/targets\/[^/]+\/guests\/[^/]+$/.test(pathname)) {
    const vmid = pathname.split("/").at(-1);
    const guest = pveGuests.find((item) => String(item.vmid) === vmid) ?? pveGuests[0];
    return {
      target: "pve-lab",
      node: guest.node,
      type: guest.type,
      vmid: String(guest.vmid),
      status: guest,
      config: { cores: 4, memory: 16384, scsi0: "local-zfs:vm-104-disk-0" },
    };
  }
  if (/^\/api\/pve\/targets\/[^/]+\/guests\/[^/]+\/metrics$/.test(pathname)) return { metrics: pveMetrics };
  if (/^\/api\/pve\/targets\/[^/]+\/guests\/[^/]+\/snapshots$/.test(pathname)) {
    return { snapshots: [{ name: "before-upgrade", description: "demo snapshot", snaptime: 1779772800 }] };
  }
  if (/^\/api\/pve\/targets\/[^/]+\/storage$/.test(pathname)) return { storage: pveStorage };
  if (/^\/api\/pve\/targets\/[^/]+\/tasks$/.test(pathname)) return { tasks: pveTasks };
  if (pathname === "/api/compute/providers") return { providers: computeProviders };
  if (pathname === "/api/compute/summary") return computeSummary;
  if (pathname === "/api/compute/guests") return { guests: computeGuests };
  if (pathname === "/api/compute/hosts") return { hosts: computeHosts };
  if (pathname === "/api/compute/storage") return { storage: computeStorage };
  if (pathname === "/api/compute/activity") return { activity: computeActivity };
  if (pathname === "/api/cloud-hosts") return { hosts: cloudHosts };
  if (pathname === "/api/cloud-hosts/metrics-snapshot") {
    return {
      prometheusConfigured: true,
      hosts: cloudHosts.map((item, index) => ({
        id: item.id,
        cpuPercent: 24 + index * 3,
        memPercent: 48 + index * 2,
        diskPercent: 61 + index,
        instance: item.nodeExporterInstance,
      })),
    };
  }
  if (/^\/api\/cloud-hosts\/[^/]+\/ssh-settings$/.test(pathname)) {
    const id = pathname.split("/")[3];
    const host = cloudHosts.find((item) => item.id === id) ?? cloudHosts[0];
    return {
      id: host.id,
      sshHost: host.sshHost,
      sshPort: host.sshPort,
      sshUserHint: host.sshUser,
      fromEnv: true,
      canConnect: true,
      writable: true,
      encryptionReady: true,
      stored: true,
      user: host.sshUser,
      port: host.sshPort,
      passwordSet: true,
      privateKeySet: false,
      insecureHostKey: true,
    };
  }
  if (pathname === "/api/network/devices") return { devices: networkDevices };
  if (/^\/api\/network\/devices\/[^/]+\/exporter-status$/.test(pathname)) return openWrtExporterStatus;
  if (/^\/api\/network\/devices\/[^/]+\/openwrt\/overview$/.test(pathname)) return openWrtOverview;
  if (/^\/api\/network\/devices\/[^/]+\/openwrt\/interfaces$/.test(pathname)) return openWrtInterfaces;
  if (/^\/api\/network\/devices\/[^/]+\/openwrt\/clients$/.test(pathname)) return openWrtClients;
  if (/^\/api\/network\/devices\/[^/]+\/openwrt\/wireless$/.test(pathname)) return openWrtWireless;
  if (/^\/api\/network\/devices\/[^/]+\/openwrt\/firewall$/.test(pathname)) return openWrtFirewall;
  if (pathname === "/api/network/ikuai-client-stream") return ikuaiClientStream;
  if (pathname === "/api/bastion/vms") return { vms: [{ name: "jumpbox-01", powerState: "poweredOn" }], extraHosts: [{ name: "edge-shell" }] };
  if (pathname === "/api/bastion/targets") return { targets: bastionTargets, warnings: [] };
  if (pathname === "/api/bastion/targets/ssh-settings") {
    return {
      stored: true,
      fromEnv: false,
      canConnect: true,
      writable: true,
      encryptionReady: true,
      user: "ops",
      port: 22,
      passwordSet: true,
      privateKeySet: false,
    };
  }
  if (pathname === "/api/vcenter/bastion/native-ssh") {
    return { enabled: true, port: 22, userConfigured: true, authConfigured: true };
  }
  if (pathname === "/api/vcenter/bastion/vms") {
    return {
      vms: vcenterVms.map((vm) => ({ moref: vm.moref, name: vm.name, powerState: vm.powerState })),
    };
  }
  if (pathname === "/api/vcenter/bastion/policy") {
    return {
      enableAcl: true,
      userVms: { admin: ["vm-101"] },
      extraHosts: [
        { id: "edge-shell", name: "edge-shell", address: "10.0.8.45", kind: "linux", sshPort: 22, sshUser: "ops" },
      ],
      manualVmGroups: [{ name: "生产服务", morefs: ["vm-101"] }],
      targetGroups: [{ name: "PVE GPU", targetIds: ["pve:pve-lab:pve-node-1:qemu:104"] }],
      hiddenVmMorefs: [],
      hiddenTargetIds: [],
      vmRdpWebEmbeds: [],
      targetRdpWebEmbeds: [],
      nativeSshEnabled: true,
      nativeSshPort: 22,
    };
  }
  if (pathname === "/api/toolbox/ip-scan/config") return { segments: ["10.0.8.0/24", "10.0.20.0/24"] };
  if (pathname === "/api/toolbox/ip-scan/history") {
    return {
      runs: [
        {
          id: "scan-1",
          segment: "10.0.8.0/24",
          startedAt: "2026-05-26T08:00:00+08:00",
          finishedAt: "2026-05-26T08:00:04+08:00",
          summary: { total: 254, used: 42, likelyFree: 212 },
          results: [
            { ip: "10.0.8.12", status: "used", ports: [22, 80, 443] },
            { ip: "10.0.8.45", status: "used", ports: [22] },
            { ip: "10.0.8.90", status: "likely_free", ports: [] },
          ],
        },
      ],
    };
  }
  if (pathname === "/api/aiops/alerts") return { rules: [{ enabled: true }, { enabled: true }, { enabled: false }], channels: [{ id: "wechat" }] };
  if (pathname === "/api/aiops/reports") return { reports: [{ id: "weekly" }, { id: "gpu" }] };
  if (pathname === "/api/aiops/panels") return { panels: [{ id: "k8s" }, { id: "vcenter" }] };
  if (pathname === "/api/aiops/provider") return { endpoint: { enabled: true, provider: "OpenClaw", model: "ops-easy-demo", apiKeySet: true } };
  if (pathname === "/api/aiops/prometheus") return { scopes: { k8s: { configured: true }, vcenter: { configured: true } } };

  return null;
}

function createMockState() {
  return { unmockedApiRequests: new Set() };
}

function apiRequestKey(url, method = "GET") {
  const { pathname } = new URL(url);
  return `${method.toUpperCase()} ${pathname}`;
}

function isIgnorableInterceptionError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Invalid InterceptionId|Target closed|WebSocket is not open/i.test(message);
}

function canRunCommand(candidate) {
  const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function findBrowser({ optional = false } = {}) {
  const fromEnv = process.env.EASYPANEL_SCREENSHOT_BROWSER ?? process.env.EASYPANEL_RENDER_BROWSER;
  const fileCandidates = [
    fromEnv,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ].filter(Boolean);

  for (const candidate of fileCandidates) {
    if (existsSync(candidate)) return candidate;
  }
  if (fromEnv && canRunCommand(fromEnv)) return fromEnv;

  const commandCandidates =
    process.platform === "win32"
      ? ["msedge", "chrome"]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  for (const candidate of commandCandidates) {
    if (canRunCommand(candidate)) return candidate;
  }
  if (optional) return null;
  return process.platform === "win32" ? "msedge" : "chromium";
}

async function findFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolvePort(address.port));
    });
  });
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return;
    } catch {
      // Keep waiting until the dev server is up.
    }
    await sleep(350);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

async function removeDirWithRetry(path) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 7) {
        console.warn(`Unable to remove temporary browser profile ${path}: ${error.message}`);
        return;
      }
      await sleep(350);
    }
  }
}

function startViteServer(port) {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run dev -- --host ${host} --port ${port} --strictPort`]
      : ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"];
  const child = spawn(command, args, {
    cwd: webDir,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function startBrowser(browser, debugPort) {
  mkdirSync(tempDir, { recursive: true });
  const profileDir = mkdtempSync(resolve(tempDir, "demo-browser-profile-"));
  const child = spawn(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-background-networking",
      "--disable-extensions",
      "--disable-sync",
      "--disable-crash-reporter",
      "--no-default-browser-check",
      "--no-first-run",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--run-all-compositor-stages-before-draw",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      "about:blank",
    ],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHttp(`http://${host}:${debugPort}/json/version`, 30_000);
  return { child, profileDir };
}

async function connectToPage(debugPort) {
  const tabs = await fetch(`http://${host}:${debugPort}/json/list`).then((res) => res.json());
  const page = tabs.find((tab) => tab.type === "page") ?? tabs[0];
  if (!page?.webSocketDebuggerUrl) throw new Error("Unable to find Chrome page websocket.");
  return new CdpClient(page.webSocketDebuggerUrl);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    await new Promise((resolveOpen, reject) => {
      this.ws.addEventListener("open", resolveOpen, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id && this.pending.has(message.id)) {
      const { resolveRequest, rejectRequest, timeout } = this.pending.get(message.id);
      clearTimeout(timeout);
      this.pending.delete(message.id);
      if (message.error) rejectRequest(new Error(`${message.error.message}: ${message.error.data ?? ""}`));
      else resolveRequest(message.result ?? {});
      return;
    }
    if (message.method && this.handlers.has(message.method)) {
      for (const handler of this.handlers.get(message.method)) handler(message.params ?? {});
    }
  }

  on(method, handler) {
    const list = this.handlers.get(method) ?? [];
    list.push(handler);
    this.handlers.set(method, list);
  }

  waitForEvent(method, predicate = () => true, timeoutMs = 30_000) {
    return new Promise((resolveEvent, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const handler = (params) => {
        if (!predicate(params)) return;
        clearTimeout(timeout);
        const list = this.handlers.get(method) ?? [];
        this.handlers.set(method, list.filter((item) => item !== handler));
        resolveEvent(params);
      };
      this.on(method, handler);
    });
  }

  send(method, params = {}, timeoutMs = 30_000) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`CDP websocket is not open for ${method}`));
    }
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        rejectRequest(new Error(`Timed out waiting for CDP ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolveRequest, rejectRequest, timeout });
    });
  }

  close() {
    for (const { rejectRequest, timeout } of this.pending.values()) {
      clearTimeout(timeout);
      rejectRequest(new Error("CDP websocket closed"));
    }
    this.pending.clear();
    this.ws?.close();
  }
}

async function handleMockedRequest(cdp, params, state) {
  const response = mockApiResponse(params.request.url, params.request.method);
  if (response === null) {
    const key = apiRequestKey(params.request.url, params.request.method);
    state.unmockedApiRequests.add(key);
    await cdp.send("Fetch.fulfillRequest", {
      requestId: params.requestId,
      responseCode: 501,
      responseHeaders: [
        { name: "Content-Type", value: "application/json; charset=utf-8" },
        { name: "Cache-Control", value: "no-store" },
      ],
      body: Buffer.from(JSON.stringify({ error: "unmocked render smoke API", request: key })).toString("base64"),
    });
    return;
  }

  const hasWrappedBody =
    Object.prototype.hasOwnProperty.call(response, "body") ||
    typeof response.status === "number";
  const responseBody = hasWrappedBody ? response.body ?? "" : response;
  const isText = typeof responseBody === "string";
  const body = isText ? responseBody : JSON.stringify(responseBody);
  const contentType = isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
  await cdp.send("Fetch.fulfillRequest", {
    requestId: params.requestId,
    responseCode: typeof response.status === "number" ? response.status : 200,
    responseHeaders: [
      { name: "Content-Type", value: contentType },
      { name: "Cache-Control", value: "no-store" },
    ],
    body: Buffer.from(body).toString("base64"),
  });
}

function assertNoUnmockedApiRequests(state) {
  if (state.unmockedApiRequests.size === 0) return;
  const requests = Array.from(state.unmockedApiRequests).sort();
  throw new Error(`render smoke has unmocked API requests:\n${requests.map((item) => `- ${item}`).join("\n")}`);
}

function renderSmokeWebSocketShimSource() {
  return `
    (() => {
      const NativeWebSocket = window.WebSocket;
      if (!NativeWebSocket || window.__easyPanelRenderSmokeWebSocketMocked) return;
      window.__easyPanelRenderSmokeWebSocketMocked = true;
      const isApiWebSocket = (url) => {
        try {
          const parsed = new URL(String(url), location.href);
          return (parsed.protocol === "ws:" || parsed.protocol === "wss:") && parsed.pathname.startsWith("/api/");
        } catch {
          return false;
        }
      };
      class MockRenderSmokeWebSocket extends EventTarget {
        constructor(url, protocols) {
          if (!isApiWebSocket(url)) {
            return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
          }
          super();
          this.url = String(new URL(String(url), location.href));
          this.protocol = "";
          this.extensions = "";
          this.bufferedAmount = 0;
          this.binaryType = "blob";
          this.readyState = MockRenderSmokeWebSocket.CONNECTING;
          setTimeout(() => this.close(1000, "render-smoke-websocket-blocked"), 0);
        }
        send() {}
        close(code = 1000, reason = "render-smoke-websocket-blocked") {
          if (this.readyState === MockRenderSmokeWebSocket.CLOSED) return;
          this.readyState = MockRenderSmokeWebSocket.CLOSED;
          const event = new Event("close");
          Object.defineProperties(event, {
            code: { value: code },
            reason: { value: reason },
            wasClean: { value: true },
          });
          this.onclose?.(event);
          this.dispatchEvent(event);
        }
      }
      MockRenderSmokeWebSocket.CONNECTING = 0;
      MockRenderSmokeWebSocket.OPEN = 1;
      MockRenderSmokeWebSocket.CLOSING = 2;
      MockRenderSmokeWebSocket.CLOSED = 3;
      window.WebSocket = MockRenderSmokeWebSocket;
    })();
  `;
}

async function waitForFrontend(cdp, path, { settleMs } = {}) {
  const expectation = routeSmokeExpectation(path);
  const expectedText = expectation.expectedText;
  const expectedFinalPath = expectation.expectedFinalPath;
  const acceptsStandaloneShell = acceptsStandaloneRenderSmokeShell(path, expectation);
  const appReadyExpression = `
    (() => {
      const text = document.body?.innerText || "";
      const app = document.querySelector(${JSON.stringify(appShellSelector)});
      const viteError = document.querySelector('vite-error-overlay');
      const hasRouteErrorBoundary = text.includes("页面渲染出错");
      const expectedText = ${JSON.stringify(expectedText)};
      const expectedFinalPath = ${JSON.stringify(expectedFinalPath)};
      const routeReady = expectedText ? text.includes(expectedText) : true;
      const finalRouteReady = expectedFinalPath ? location.pathname === expectedFinalPath : true;
      const acceptsStandaloneShell = ${JSON.stringify(acceptsStandaloneShell)};
      return (acceptsStandaloneShell || Boolean(app)) && text.length > 80 && routeReady && finalRouteReady && !viteError && !hasRouteErrorBoundary;
    })()
  `;
  const start = Date.now();
  while (Date.now() - start < 45_000) {
    const result = await cdp.send("Runtime.evaluate", {
      expression: appReadyExpression,
      returnByValue: true,
    });
    if (result?.result?.value === true) {
      await cdp.send("Runtime.evaluate", {
        expression: "document.fonts ? document.fonts.ready : Promise.resolve(true)",
        awaitPromise: true,
        returnByValue: true,
      });
      await sleep(settleMs ?? (path === "/" ? 2500 : 2000));
      return;
    }
    await sleep(250);
  }
  const diagnostic = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      href: location.href,
      expectedText: ${JSON.stringify(expectedText)},
      expectedFinalPath: ${JSON.stringify(expectedFinalPath)},
      finalPath: location.pathname,
      readyState: document.readyState,
      acceptsStandaloneShell: ${JSON.stringify(acceptsStandaloneShell)},
      hasAppShell: Boolean(document.querySelector(${JSON.stringify(appShellSelector)})),
      hasViteError: Boolean(document.querySelector('vite-error-overlay')),
      hasRouteErrorBoundary: (document.body?.innerText || '').includes("页面渲染出错"),
      text: (document.body?.innerText || '').slice(0, 1200)
    })`,
    returnByValue: true,
  });
  console.error(diagnostic?.result?.value);
  throw new Error(`Timed out waiting for frontend page ${path}`);
}

async function captureScreenshot(cdp, url, output, path) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: screenshotWidth,
    height: screenshotHeight,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loadEvent = cdp.waitForEvent("Page.loadEventFired", () => true, 30_000);
  await cdp.send("Page.navigate", { url });
  await loadEvent;
  await waitForFrontend(cdp, path);
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  writeFileSync(output, Buffer.from(screenshot.data, "base64"));
}

async function verifyRenderSmoke(cdp, url, path, viewport) {
  const expectation = routeSmokeExpectation(path);
  const expectedText = expectation.expectedText;
  const expectedFinalPath = expectation.expectedFinalPath;
  const acceptsStandaloneShell = acceptsStandaloneRenderSmokeShell(path, expectation);
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  const loadEvent = cdp.waitForEvent("Page.loadEventFired", () => true, 30_000);
  await cdp.send("Page.navigate", { url });
  await loadEvent;
  await waitForFrontend(cdp, path, { settleMs: 350 });

  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      JSON.stringify((() => {
        const describe = (el) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          const className = typeof el.className === "string" ? el.className : (el.getAttribute("class") || "");
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || "",
            className: className.slice(0, 160),
            text: (el.innerText || el.textContent || "").trim().slice(0, 120),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const doc = document.documentElement;
        const body = document.body;
        const maxScrollWidth = Math.max(doc?.scrollWidth || 0, body?.scrollWidth || 0);
        const overflowElements = Array.from(document.querySelectorAll("body *"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
            if (rect.width < 1 || rect.height < 1) return false;
            return rect.left < -2 || rect.right > window.innerWidth + 2;
          })
          .slice(0, 8)
          .map(describe);
        return {
          href: location.href,
          finalPath: location.pathname,
          expectedText: ${JSON.stringify(expectedText)},
          expectedFinalPath: ${JSON.stringify(expectedFinalPath)},
          hasExpectedText: ${JSON.stringify(expectedText)} ? (body?.innerText || "").includes(${JSON.stringify(expectedText)}) : true,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          textLength: (body?.innerText || "").length,
          textSample: (body?.innerText || "").trim().slice(0, 400),
          hasRoot: Boolean(document.querySelector("#root")),
          acceptsStandaloneShell: ${JSON.stringify(acceptsStandaloneShell)},
          hasAppShell: Boolean(document.querySelector(${JSON.stringify(appShellSelector)})),
          hasViteError: Boolean(document.querySelector("vite-error-overlay")),
          hasRouteErrorBoundary: (body?.innerText || "").includes("页面渲染出错"),
          documentScrollWidth: doc?.scrollWidth || 0,
          bodyScrollWidth: body?.scrollWidth || 0,
          maxScrollWidth,
          overflowElements,
        };
      })())
    `,
    returnByValue: true,
  });
  const metrics = JSON.parse(result?.result?.value ?? "{}");
  const failures = [];
  if (!metrics.hasRoot) failures.push("missing #root");
  if (!metrics.hasAppShell && !metrics.acceptsStandaloneShell) failures.push(`missing app shell ${appShellSelector}`);
  if (metrics.hasViteError) failures.push("Vite error overlay is present");
  if (metrics.hasRouteErrorBoundary) failures.push("route error boundary is present");
  if (metrics.expectedFinalPath && metrics.finalPath !== metrics.expectedFinalPath) {
    failures.push(`final route ${metrics.finalPath} expected ${metrics.expectedFinalPath}`);
  }
  if (metrics.expectedText && !metrics.hasExpectedText) {
    failures.push(`expected text ${JSON.stringify(metrics.expectedText)} missing from page`);
  }
  if ((metrics.textLength ?? 0) < 80) failures.push(`rendered text is too short (${metrics.textLength ?? 0})`);
  if ((metrics.maxScrollWidth ?? 0) > viewport.width + 2) {
    failures.push(`page-level horizontal overflow (${metrics.maxScrollWidth}px > ${viewport.width}px)`);
  }
  if (failures.length > 0) {
    throw new Error(
      `${viewport.name} render smoke failed for ${path}: ${failures.join("; ")}\n${JSON.stringify(metrics, null, 2)}`
    );
  }
  return metrics;
}

function writeDemoDocs() {
  mkdirSync(assetDir, { recursive: true });
  writeFileSync(resolve(demoDir, "demo-data.json"), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(
    resolve(demoDir, "README.md"),
    `# EasyPanel 演示数据与截图

本目录保存 README 使用的演示数据和前端截图。截图不是手绘图，也不是静态 HTML 预览，而是由 \`scripts/generate-demo-assets.mjs\` 启动真实 Vite 前端，在浏览器测试上下文中 mock \`/api/*\` 响应后截取现有页面得到。

- 数据源：\`demo-data.json\`
- 截图目录：\`assets/\`，统一使用 1920x1080 浏览器视口
- 重新生成：\`node scripts/generate-demo-assets.mjs\`

脚本会打开这些现有前端路径：

- \`/\`
- \`/cluster/ns/easy/pods\`
- \`/cluster/apps/dashboard\`
- \`/cluster/baota\`
- \`/cluster/baota/ingress\`
- \`/cluster/baota/sync\`
- \`/cluster/compute/dashboard\`
- \`/cluster/network/dashboard\`
`
  );
}

async function runWithMockedFrontend(task, { optionalBrowser = false, skipMessage } = {}) {
  const browser = findBrowser({ optional: optionalBrowser });
  if (!browser) {
    console.warn(skipMessage ?? "Skipped browser render task: no Chromium-family browser was found.");
    return { skipped: true };
  }
  const vitePort = await findFreePort();
  const debugPort = await findFreePort();
  const vite = startViteServer(vitePort);
  const mockState = createMockState();
  let browserSession;
  let cdp;

  try {
    await waitForHttp(`http://${host}:${vitePort}/`, 60_000);
    browserSession = await startBrowser(browser, debugPort);
    cdp = await connectToPage(debugPort);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: renderSmokeWebSocketShimSource() });
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", {
      urls: [`ws://${host}:${vitePort}/api/*`, `wss://${host}:${vitePort}/api/*`],
    });
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: `*://${host}:${vitePort}/api/*`, requestStage: "Request" }],
    });
    cdp.on("Fetch.requestPaused", (params) => {
      void handleMockedRequest(cdp, params, mockState).catch((error) => {
        if (isIgnorableInterceptionError(error)) return;
        console.error(`Failed to mock ${params.request?.url}: ${error.message}`);
      });
    });

    await task({ cdp, baseUrl: `http://${host}:${vitePort}`, browser });
    await sleep(renderSmokePostTaskSettleMs);
    assertNoUnmockedApiRequests(mockState);
    try {
      await cdp.send("Page.navigate", { url: "about:blank" }, 5_000);
      await sleep(100);
      assertNoUnmockedApiRequests(mockState);
    } catch (error) {
      console.warn(`Render smoke cleanup navigation skipped: ${error.message}`);
    }
    return { skipped: false };
  } finally {
    if (browserSession) {
      stopProcessTree(browserSession.child);
      await removeDirWithRetry(browserSession.profileDir);
    }
    cdp?.close();
    stopProcessTree(vite);
  }
}

async function generateDemoAssets() {
  writeDemoDocs();
  await runWithMockedFrontend(async ({ cdp, baseUrl, browser }) => {
    for (const item of demoRoutes) {
      await captureScreenshot(cdp, `${baseUrl}${item.path}`, resolve(assetDir, item.filename), item.path);
    }

    console.log(`Generated EasyPanel frontend screenshots with ${browser}.`);
  });
}

async function runRenderSmoke() {
  let checks = 0;
  const routes = selectedRenderSmokeRoutes();
  const viewports = selectedRenderSmokeViewports();
  await runWithMockedFrontend(
    async ({ cdp, baseUrl, browser }) => {
      for (const viewport of viewports) {
        for (const item of routes) {
          const metrics = await verifyRenderSmoke(cdp, `${baseUrl}${item.path}`, item.path, viewport);
          checks += 1;
          console.log(`render smoke ok ${viewport.name} ${item.path} (${metrics.textLength} chars)`);
        }
      }
      console.log(`Render smoke passed with ${browser}: ${checks} checks across ${viewports.length} viewports.`);
    },
    {
      optionalBrowser: process.env.EASYPANEL_RENDER_SMOKE_REQUIRED !== "1",
      skipMessage:
        "Skipped render smoke: no Chromium-family browser was found. Set EASYPANEL_RENDER_SMOKE_REQUIRED=1 to fail instead.",
    }
  );
}

async function main() {
  if (process.argv.includes("--render-smoke")) {
    await runRenderSmoke();
    return;
  }
  await generateDemoAssets();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
