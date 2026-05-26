import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = resolve(rootDir, "web");
const demoDir = resolve(rootDir, "docs", "demo");
const assetDir = resolve(demoDir, "assets");
const tempDir = resolve(rootDir, ".vite");
const host = "127.0.0.1";
const screenshotWidth = 1920;
const screenshotHeight = 1080;

const data = {
  product: "EasyPanel",
  generatedBy: "scripts/generate-demo-assets.mjs",
  seed: "easy-panel-open-source-demo-v2",
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
};

const appInstances = {
  redis: Array.from({ length: 6 }, (_, index) => ({ id: `redis-${index + 1}`, name: `redis-${index + 1}`, namespace: index % 2 ? "app-prod" : "easy" })),
  mysql: Array.from({ length: 5 }, (_, index) => ({ id: `mysql-${index + 1}`, name: `mysql-${index + 1}`, namespace: "app-prod" })),
  kafka: Array.from({ length: 3 }, (_, index) => ({ id: `kafka-${index + 1}`, name: `kafka-${index + 1}`, namespace: "app-prod" })),
  opensearch: Array.from({ length: 4 }, (_, index) => ({ id: `opensearch-${index + 1}`, name: `opensearch-${index + 1}`, namespace: "observability" })),
  cloudVm: Array.from({ length: 9 }, (_, index) => ({ id: `cloud-vm-${index + 1}`, name: `cloud-vm-${index + 1}`, provider: index % 2 ? "pve" : "vcenter" })),
  openclaw: Array.from({ length: 2 }, (_, index) => ({ id: `openclaw-${index + 1}`, displayName: `OpenClaw ${index + 1}`, namespace: "easy", deploymentName: `openclaw-${index + 1}` })),
  hermes: Array.from({ length: 2 }, (_, index) => ({ id: `hermes-${index + 1}`, displayName: `Hermes ${index + 1}`, namespace: "easy", deploymentName: `hermes-${index + 1}` })),
};

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

function mockApiResponse(url, method = "GET") {
  const { pathname, searchParams } = new URL(url);
  if (method === "OPTIONS") return { status: 204, body: "" };

  if (pathname === "/api/setup/status") {
    return { initialized: true, dataDir: "/data", version: 1, configMode: "database" };
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
  if (pathname === "/api/config") return appConfig;
  if (pathname === "/api/runtime/status") {
    return { config: appConfig, systemCheck, buildVersion: "demo-open-source", mysqlSchema: { configured: true, reachable: true, schemaAligned: true } };
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
  if (pathname === "/api/k8s/pods") {
    const namespace = searchParams.get("namespace");
    return namespace ? pods.filter((pod) => pod.namespace === namespace) : pods;
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
  if (pathname === "/api/namespaces") return data.namespaces.map((namespace) => namespace.name);
  if (pathname === "/api/services") {
    return [
      { namespace: "easy", name: "easypanel-web", ports: [80, 443] },
      { namespace: "easy", name: "easypanel-api", ports: [8080] },
      { namespace: "app-prod", name: "orders-api", ports: [8080, 9090] },
      { namespace: "observability", name: "victoria-logs", ports: [3100] },
    ];
  }
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
  if (pathname === "/api/app-center/mysql/instances") return { instances: appInstances.mysql };
  if (pathname === "/api/app-center/kafka/instances") return { instances: appInstances.kafka };
  if (pathname === "/api/app-center/opensearch/instances") return { instances: appInstances.opensearch };
  if (pathname === "/api/app-center/cloud-vm/instances") return { instances: appInstances.cloudVm };
  if (pathname === "/api/app-center/openclaw/instances") return { instances: appInstances.openclaw };
  if (pathname === "/api/app-center/hermes/instances") return { instances: appInstances.hermes };
  if (pathname === "/api/dns/accounts") return { accounts: [{ id: "cloudflare", name: "Cloudflare demo" }, { id: "dnspod", name: "DNSPod demo" }] };
  if (pathname === "/api/dns/domains") return { domains: [{ name: "easypanel.dev" }, { name: "ops-easy.dev" }, { name: "lab.easypanel.dev" }] };
  if (pathname === "/api/vcenter/vms") {
    return { vms: Array.from({ length: 18 }, (_, index) => ({ name: `vm-${index + 1}`, powerState: index % 4 === 0 ? "poweredOff" : "poweredOn" })) };
  }
  if (pathname === "/api/vcenter/hosts") {
    return { hosts: Array.from({ length: 4 }, (_, index) => ({ name: `esxi-${index + 1}`, memoryTotalMB: 131072, memoryUsageMB: 78643 })) };
  }
  if (pathname === "/api/pve/targets") return { targets: [{ id: "pve-lab" }, { id: "pve-edge" }] };
  if (pathname === "/api/compute/providers") return { providers: computeProviders };
  if (pathname === "/api/compute/summary") return computeSummary;
  if (pathname === "/api/network/devices") return { devices: networkDevices };
  if (/^\/api\/network\/devices\/[^/]+\/exporter-status$/.test(pathname)) return openWrtExporterStatus;
  if (pathname === "/api/bastion/vms") return { vms: [{ name: "jumpbox-01", powerState: "poweredOn" }], extraHosts: [{ name: "edge-shell" }] };
  if (pathname === "/api/aiops/alerts") return { rules: [{ enabled: true }, { enabled: true }, { enabled: false }], channels: [{ id: "wechat" }] };
  if (pathname === "/api/aiops/reports") return { reports: [{ id: "weekly" }, { id: "gpu" }] };
  if (pathname === "/api/aiops/panels") return { panels: [{ id: "k8s" }, { id: "vcenter" }] };
  if (pathname === "/api/aiops/provider") return { endpoint: { enabled: true, provider: "OpenClaw", model: "ops-easy-demo", apiKeySet: true } };
  if (pathname === "/api/aiops/prometheus") return { scopes: { k8s: { configured: true }, vcenter: { configured: true } } };

  if (pathname.includes("/instances")) return { instances: [] };
  if (pathname.endsWith("/devices")) return { devices: [] };
  if (pathname.endsWith("/vms")) return { vms: [] };
  if (pathname.endsWith("/hosts")) return { hosts: [] };
  if (pathname.startsWith("/api/")) return {};
  return null;
}

function findBrowser() {
  const fromEnv = process.env.EASYPANEL_SCREENSHOT_BROWSER;
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
  child.kill("SIGTERM");
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
  const child = spawn(
    "npm",
    ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"],
    { cwd: webDir, shell: true, stdio: ["ignore", "pipe", "pipe"] }
  );
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
    { stdio: ["ignore", "ignore", "pipe"] }
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
      const { resolveRequest, rejectRequest } = this.pending.get(message.id);
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

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolveRequest, rejectRequest) => {
      this.pending.set(id, { resolveRequest, rejectRequest });
    });
  }

  close() {
    this.ws?.close();
  }
}

async function handleMockedRequest(cdp, params) {
  const response = mockApiResponse(params.request.url, params.request.method);
  if (response === null) {
    await cdp.send("Fetch.continueRequest", { requestId: params.requestId });
    return;
  }

  const hasWrappedBody =
    Object.prototype.hasOwnProperty.call(response, "body") ||
    Object.prototype.hasOwnProperty.call(response, "status");
  const responseBody = hasWrappedBody ? response.body ?? "" : response;
  const isText = typeof responseBody === "string";
  const body = isText ? responseBody : JSON.stringify(responseBody);
  const contentType = isText ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
  await cdp.send("Fetch.fulfillRequest", {
    requestId: params.requestId,
    responseCode: response.status ?? 200,
    responseHeaders: [
      { name: "Content-Type", value: contentType },
      { name: "Cache-Control", value: "no-store" },
    ],
    body: Buffer.from(body).toString("base64"),
  });
}

async function waitForFrontend(cdp, path) {
  const routeNeedle = {
    "/": "Kubernetes",
    "/cluster/ns/easy/pods": "easypanel-api",
    "/cluster/apps/dashboard": "Dashboard",
    "/cluster/baota": "API",
    "/cluster/baota/ingress": "Ingress Rules",
    "/cluster/baota/sync": "Baota Sync",
    "/cluster/compute/dashboard": "Dashboard",
    "/cluster/network/dashboard": "NETWORK CENTER",
  }[path];
  const appReadyExpression = `
    (() => {
      const text = document.body?.innerText || "";
      const app = document.querySelector('[data-cmp="AppLayout"]');
      const viteError = document.querySelector('vite-error-overlay');
      const routeReady = ${JSON.stringify(routeNeedle)} ? text.includes(${JSON.stringify(routeNeedle)}) : true;
      return Boolean(app) && text.length > 120 && routeReady && !viteError;
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
      await sleep(path === "/" ? 2500 : 2000);
      return;
    }
    await sleep(250);
  }
  const diagnostic = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify({
      href: location.href,
      readyState: document.readyState,
      hasAppLayout: Boolean(document.querySelector('[data-cmp="AppLayout"]')),
      hasViteError: Boolean(document.querySelector('vite-error-overlay')),
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

async function main() {
  writeDemoDocs();
  const browser = findBrowser();
  const vitePort = await findFreePort();
  const debugPort = await findFreePort();
  const vite = startViteServer(vitePort);
  let browserSession;
  let cdp;

  try {
    await waitForHttp(`http://${host}:${vitePort}/`, 60_000);
    browserSession = await startBrowser(browser, debugPort);
    cdp = await connectToPage(debugPort);
    await cdp.open();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: `*://${host}:${vitePort}/api/*`, requestStage: "Request" }],
    });
    cdp.on("Fetch.requestPaused", (params) => {
      void handleMockedRequest(cdp, params).catch((error) => {
        console.error(`Failed to mock ${params.request?.url}: ${error.message}`);
      });
    });

    const screenshots = [
      { path: "/", filename: "easypanel-dashboard.png" },
      { path: "/cluster/ns/easy/pods", filename: "easypanel-kubernetes.png" },
      { path: "/cluster/apps/dashboard", filename: "easypanel-app-center.png" },
      { path: "/cluster/baota", filename: "easypanel-baota-dashboard.png" },
      { path: "/cluster/baota/ingress", filename: "easypanel-ingress.png" },
      { path: "/cluster/baota/sync", filename: "easypanel-baota-sync.png" },
      { path: "/cluster/compute/dashboard", filename: "easypanel-compute.png" },
      { path: "/cluster/network/dashboard", filename: "easypanel-network.png" },
    ];

    for (const item of screenshots) {
      await captureScreenshot(
        cdp,
        `http://${host}:${vitePort}${item.path}`,
        resolve(assetDir, item.filename),
        item.path
      );
    }

    console.log(`Generated EasyPanel frontend screenshots with ${browser}.`);
  } finally {
    cdp?.close();
    if (browserSession) {
      stopProcessTree(browserSession.child);
      await removeDirWithRetry(browserSession.profileDir);
    }
    stopProcessTree(vite);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
