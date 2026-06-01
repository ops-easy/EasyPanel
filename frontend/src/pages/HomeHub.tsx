import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Hexagon,
  Monitor,
  Server,
  AppWindow,
  Sparkles,
  SquareTerminal,
  Network,
  Library,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { apiGetJson } from "@/lib/api";
import { workspaceMenuVisible } from "@/lib/platform-permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import { type K8sSummary } from "@/features/cluster/pages/types";
import { type VCenterVMsResponse, type VCenterHostsResponse } from "@/features/vcenter/pages/types";
import { OBSERVABILITY_INSPECT_WORKSPACE_LABEL } from "@/features/ops/ai-inspect/aiInspectNavigation";

type RedisStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  mirrorRedisOk: boolean;
};

type AiAlertsGet = {
  rules: { enabled: boolean }[];
  channels: unknown[];
};

type AIProviderGet = {
  endpoint: { enabled: boolean; apiKeySet?: boolean };
};

type NetworkDevice = {
  id: string;
  kind: "ikuai" | "openwrt";
};

type PVETarget = {
  id: string;
};

type BastionTarget = {
  id: string;
  provider: "vcenter" | "pve" | "extra" | string;
  powerState?: string;
};

type HubIngressRow = {
  managed?: boolean;
};

type DocsListGet = {
  docs: { id: number; contentKind?: string }[];
};

type DocsMediaGet = {
  items: unknown[];
};

type DocsAttachmentStorageGet = {
  mode?: string;
  cos?: { configured?: boolean };
};

type HubStatusTone = "slate" | "emerald" | "amber" | "cyan" | "teal" | "violet";

function HubStatusPill({
  tone = "slate",
  icon,
  children,
}: {
  tone?: HubStatusTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const toneClass: Record<HubStatusTone, string> = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    cyan: "bg-cyan-50 text-cyan-700",
    teal: "bg-teal-50 text-teal-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none",
        toneClass[tone]
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function StatusBadge({ ok, loading, error, errorLabel = "摘要异常" }: { ok: boolean; loading?: boolean; error?: boolean; errorLabel?: string }) {
  if (loading) {
    return <HubStatusPill tone="slate">检查中…</HubStatusPill>;
  }
  if (error) {
    return (
      <HubStatusPill tone="amber" icon={<AlertCircle size={11} />}>
        {errorLabel}
      </HubStatusPill>
    );
  }
  return ok ? (
    <HubStatusPill tone="emerald" icon={<CheckCircle2 size={11} />}>
      已就绪
    </HubStatusPill>
  ) : (
    <HubStatusPill tone="amber" icon={<AlertCircle size={11} />}>
      待配置
    </HubStatusPill>
  );
}

function MetricItem({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <span className="text-[11px] leading-none text-gray-400">{label}</span>
      <span className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-gray-900">
        {value}
      </span>
    </div>
  );
}

function HubMetricGrid({
  children,
  columns = "grid-cols-2",
}: {
  children: React.ReactNode;
  columns?: string;
}) {
  return (
    <div className={cn("mt-4 grid gap-x-5 gap-y-3 border-t border-gray-100 pt-4", columns)}>
      {children}
    </div>
  );
}

function HubCardHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 min-h-[42px] text-xs leading-relaxed text-gray-500">
      {children}
    </p>
  );
}

function fmtMB(mb: number): string {
  if (mb >= 1024 * 1024) return `${(mb / 1024 / 1024).toFixed(1)} TB`;
  if (mb >= 1024) return `${(mb / 1024).toFixed(0)} GB`;
  return `${mb} MB`;
}

function queryCountMetric(
  query: { isLoading: boolean; isFetching: boolean; isError: boolean },
  value: number
): number | string {
  if (query.isLoading || query.isFetching) return "…";
  if (query.isError) return "异常";
  return value;
}

function queryMySQLBackedCountMetric(
  query: { isLoading: boolean; isFetching: boolean; isError: boolean },
  value: number,
  mysqlChecking: boolean,
  mysqlUnavailable: boolean
): number | string {
  if (mysqlChecking) return "…";
  if (mysqlUnavailable) return "MySQL 异常";
  return queryCountMetric(query, value);
}

function queryTextMetric(
  query: { isLoading: boolean; isFetching: boolean; isError: boolean },
  value: string
): string {
  if (query.isLoading || query.isFetching) return "…";
  if (query.isError) return "异常";
  return value;
}

function queryConfiguredMetric(
  query: { isLoading: boolean; isFetching: boolean; isError: boolean },
  configured: boolean
): string {
  return queryTextMetric(query, configured ? "已配置" : "未配置");
}

const HomeHub: React.FC = () => {
  const { status: authStatus } = useAuth();
  const runtimeQ = useRuntimeStatusQuery();
  const cfg = runtimeQ.data?.config;
  const check = runtimeQ.data?.systemCheck;
  const perm = cfg?.permissions;
  const hubRole = authStatus?.role;
  const isAdmin = authStatus?.role === "admin";
  const loggedIn = Boolean(authStatus?.loggedIn);

  const cfgLoading = runtimeQ.isLoading;

  const showK8s = workspaceMenuVisible(perm, "kubernetes", hubRole);
  const showVc = workspaceMenuVisible(perm, "compute", hubRole);
  const showNetwork = workspaceMenuVisible(perm, "network", hubRole);
  const showBaota = workspaceMenuVisible(perm, "baota", hubRole);
  const showAppCenter = workspaceMenuVisible(perm, "appcenter", hubRole);
  const showBastion = workspaceMenuVisible(perm, "bastion", hubRole);
  const showAiInspect = workspaceMenuVisible(perm, "aiinspect", hubRole);
  const showDocs = workspaceMenuVisible(perm, "docs", hubRole);
  const showHub = workspaceMenuVisible(perm, "hub", hubRole);
  const appCenterSummaryEnabled = loggedIn && showAppCenter;
  const aiInspectSummaryEnabled = loggedIn && showAiInspect;
  const docsSummaryEnabled = loggedIn && showDocs;
  const baotaIngressSummaryEnabled = loggedIn && showBaota && cfg?.k8sConfigured === true;

  // K8s summary
  const k8sQ = useQuery({
    queryKey: ["k8s-summary-hub"],
    queryFn: ({ signal }) => apiGetJson<K8sSummary>("/api/k8s/summary", { signal }),
    enabled: cfg?.k8sConfigured === true && showK8s,
  });

  // vCenter
  const vcVmsQ = useQuery({
    queryKey: ["vcenter-vms-hub"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: cfg?.vcenterConfigured === true && showVc,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const vcHostsQ = useQuery({
    queryKey: ["vcenter-hosts-hub"],
    queryFn: ({ signal }) => apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    enabled: cfg?.vcenterConfigured === true && showVc,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const pveTargetsQ = useQuery({
    queryKey: ["pve-targets-hub"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
    enabled: loggedIn && showVc,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // App center
  const appStatusQ = useQuery({
    queryKey: ["app-center-redis-status-hub"],
    queryFn: ({ signal }) => apiGetJson<RedisStatus>("/api/app-center/redis/status", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const redisQ = useQuery({
    queryKey: ["app-center-redis-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/redis/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const mysqlQ = useQuery({
    queryKey: ["app-center-mysql-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/mysql/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const kafkaQ = useQuery({
    queryKey: ["app-center-kafka-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/kafka/instances", { signal }),
    enabled: appCenterSummaryEnabled && appStatusQ.data?.mysqlReachable === true,
  });
  const cloudVmQ = useQuery({
    queryKey: ["app-center-cloud-vm-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/cloud-vm/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const openClawQ = useQuery({
    queryKey: ["app-center-openclaw-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/openclaw/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const hermesQ = useQuery({
    queryKey: ["app-center-hermes-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/hermes/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const openSearchQ = useQuery({
    queryKey: ["app-center-opensearch-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/opensearch/instances", { signal }),
    enabled: appCenterSummaryEnabled,
  });
  const dnsDomainsQ = useQuery({
    queryKey: ["app-center-dns-domains-hub"],
    queryFn: ({ signal }) => apiGetJson<{ domains: unknown[] }>("/api/dns/domains", { signal }),
    enabled: appCenterSummaryEnabled && appStatusQ.data?.mysqlReachable === true,
  });

  // 堡垒机
  const bastionTargetsQ = useQuery({
    queryKey: ["bastion-targets-hub"],
    queryFn: ({ signal }) => apiGetJson<{ targets: BastionTarget[] }>("/api/bastion/targets", { signal }),
    enabled: loggedIn && showBastion,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // 观测与巡检
  const aiAlertsQ = useQuery({
    queryKey: ["ops-alerts-hub"],
    queryFn: ({ signal }) => apiGetJson<AiAlertsGet>("/api/ops/alerts", { signal }),
    enabled: aiInspectSummaryEnabled && isAdmin,
  });
  const aiProviderQ = useQuery({
    queryKey: ["ops-ai-provider-hub"],
    queryFn: ({ signal }) => apiGetJson<AIProviderGet>("/api/ops/ai-provider", { signal }),
    enabled: aiInspectSummaryEnabled && isAdmin,
  });
  const aiReportsQ = useQuery({
    queryKey: ["ops-inspect-reports-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ reports: unknown[] }>("/api/ops/inspect/reports", { signal }),
    enabled: aiInspectSummaryEnabled && isAdmin,
  });
  const aiPanelsQ = useQuery({
    queryKey: ["ops-monitoring-panels-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ panels: { id: string }[] }>("/api/ops/monitoring/panels", { signal }),
    enabled: aiInspectSummaryEnabled,
  });
  const aiPromQ = useQuery({
    queryKey: ["prometheus-status-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ scopes?: { k8s?: { configured?: boolean }; vcenter?: { configured?: boolean } } }>(
        "/api/prometheus/status",
        { signal }
      ),
    enabled: aiInspectSummaryEnabled,
  });

  const networkDevicesQ = useQuery({
    queryKey: ["network-devices-hub"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    enabled: loggedIn && showNetwork,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const baotaIngressQ = useQuery({
    queryKey: ["baota-ingresses-hub"],
    queryFn: ({ signal }) => apiGetJson<HubIngressRow[]>("/api/ingresses", { signal }),
    enabled: baotaIngressSummaryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const docsRegularQ = useQuery({
    queryKey: ["docs-regular-hub"],
    queryFn: ({ signal }) => apiGetJson<DocsListGet>("/api/docs?scope=regular", { signal }),
    enabled: docsSummaryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const docsGuidesQ = useQuery({
    queryKey: ["docs-guides-hub"],
    queryFn: ({ signal }) => apiGetJson<DocsListGet>("/api/docs?scope=guides", { signal }),
    enabled: docsSummaryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const docsMediaQ = useQuery({
    queryKey: ["docs-media-hub"],
    queryFn: ({ signal }) => apiGetJson<DocsMediaGet>("/api/docs/media", { signal }),
    enabled: docsSummaryEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const docsStorageQ = useQuery({
    queryKey: ["docs-attachment-storage-hub"],
    queryFn: ({ signal }) => apiGetJson<DocsAttachmentStorageGet>("/api/docs/attachment-storage", { signal }),
    enabled: docsSummaryEnabled && isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const hubCardClass =
    "group flex min-h-[360px] min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md";
  const hubEntryClass = "mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium group-hover:underline";

  // vCenter aggregated stats（useMemo：避免无关 query 更新时重复 reduce）
  const {
    vcMemTotalMB,
    vcMemUsedMB,
    vcMemFreeMB,
    nVcVm,
    nVcHost,
    vcLoading,
  } = useMemo(() => {
    const hosts = vcHostsQ.data?.hosts ?? [];
    const memTotal = hosts.reduce((s, h) => s + (h.memoryTotalMB ?? 0), 0);
    const memUsed = hosts.reduce((s, h) => s + (h.memoryUsageMB ?? 0), 0);
    const memFree = memTotal - memUsed;
    return {
      vcMemTotalMB: memTotal,
      vcMemUsedMB: memUsed,
      vcMemFreeMB: memFree,
      nVcVm: vcVmsQ.data?.vms?.length ?? 0,
      nVcHost: hosts.length,
      vcLoading: vcVmsQ.isLoading || vcVmsQ.isFetching || vcHostsQ.isLoading || vcHostsQ.isFetching,
    };
  }, [vcHostsQ.data?.hosts, vcVmsQ.data?.vms, vcVmsQ.isLoading, vcVmsQ.isFetching, vcHostsQ.isLoading, vcHostsQ.isFetching]);

  const { nRedis, nMySQL, nKafka, nCloudVm, nOpenClaw, nHermes, nOpenSearch, nDomains, appCenterTotal } = useMemo(() => {
    const nr = redisQ.data?.instances?.length ?? 0;
    const nm = mysqlQ.data?.instances?.length ?? 0;
    const nk = kafkaQ.data?.instances?.length ?? 0;
    const nc = cloudVmQ.data?.instances?.length ?? 0;
    const no = openClawQ.data?.instances?.length ?? 0;
    const nh = hermesQ.data?.instances?.length ?? 0;
    const nos = openSearchQ.data?.instances?.length ?? 0;
    const nd = dnsDomainsQ.data?.domains?.length ?? 0;
    return {
      nRedis: nr,
      nMySQL: nm,
      nKafka: nk,
      nCloudVm: nc,
      nOpenClaw: no,
      nHermes: nh,
      nOpenSearch: nos,
      nDomains: nd,
      appCenterTotal: nr + nm + nk + nc + no + nh + nos + nd,
    };
  }, [
    redisQ.data?.instances,
    mysqlQ.data?.instances,
    kafkaQ.data?.instances,
    cloudVmQ.data?.instances,
    openClawQ.data?.instances,
    hermesQ.data?.instances,
    openSearchQ.data?.instances,
    dnsDomainsQ.data?.domains,
  ]);

  const k8sOk = cfg?.k8sConfigured === true;
  const k8sSummaryLoading = cfgLoading || k8sQ.isLoading || k8sQ.isFetching;
  const k8sSummaryError = !k8sSummaryLoading && k8sQ.isError;
  const k8sNeedsSetup = !k8sSummaryLoading && !k8sSummaryError && !k8sOk;
  const vcOk = cfg?.vcenterConfigured === true;
  const nPveTargets = pveTargetsQ.data?.targets?.length ?? 0;
  const pveTargetsLoading = pveTargetsQ.isLoading || pveTargetsQ.isFetching;
  const computeCloudVmLoading = showAppCenter && (cloudVmQ.isLoading || cloudVmQ.isFetching);
  const computeOk = vcOk || nPveTargets > 0 || (showAppCenter && nCloudVm > 0);
  const computeLoading = cfgLoading || vcLoading || pveTargetsLoading || computeCloudVmLoading;
  const computeSummaryError = vcVmsQ.isError || vcHostsQ.isError || pveTargetsQ.isError || (showAppCenter && cloudVmQ.isError);
  const computeNeedsSetup = !computeLoading && !computeSummaryError && !computeOk;
  const vCenterVmMetric = vcOk ? queryCountMetric(vcVmsQ, nVcVm) : "未配置";
  const vCenterHostMetric = vcOk ? queryCountMetric(vcHostsQ, nVcHost) : "未配置";
  const pveTargetMetric = pveTargetsLoading
    ? "…"
    : pveTargetsQ.isError
    ? "异常"
    : nPveTargets > 0
    ? nPveTargets
    : "未配置";
  const pveHubHint =
    !pveTargetsLoading && nPveTargets === 0 && !vcOk
      ? "PVE 未配置：请先在 PVE 目标页登记 Proxmox VE API 地址与凭据，之后节点、虚拟机和存储摘要会自动汇总。"
      : !pveTargetsLoading && nPveTargets === 0
      ? "当前已配置 vCenter；如需同时纳管 PVE，可在配置页继续追加 Proxmox VE 目标。"
      : "";
  const k8sMetricValue = (value?: number): number | string => {
    if (k8sSummaryLoading) return "…";
    if (k8sQ.isError) return "异常";
    if (!k8sOk) return "未配置";
    return value ?? "—";
  };
  const baotaTargetOk = cfg?.baotaTargets?.some((t) => Boolean(t.url && t.hasApiKey)) ?? false;
  const baotaOk = Boolean((cfg?.hasBaotaApiKey && cfg?.baotaUrl) || baotaTargetOk);
  const baotaReachable = check?.baota.status === "success";
  const baotaSummaryLoading = cfgLoading || baotaIngressQ.isLoading || baotaIngressQ.isFetching;
  const baotaSummaryError = !baotaSummaryLoading && ((baotaOk && !baotaReachable) || baotaIngressQ.isError);
  const baotaNeedsSetup = !baotaSummaryLoading && !baotaSummaryError && !baotaOk;
  const baotaStatusErrorLabel = baotaIngressQ.isError ? "路由异常" : "连接异常";
  const nConfiguredBaotaTargets = cfg?.baotaTargets?.filter((t) => Boolean(t.url && t.hasApiKey)).length ?? 0;
  const nBaotaTargets = nConfiguredBaotaTargets > 0 ? nConfiguredBaotaTargets : baotaOk ? 1 : 0;
  const ddnsOk = Boolean(cfg?.ddnsHost?.trim());
  const baotaIngressRows = baotaIngressQ.data ?? [];
  const nBaotaIngresses = baotaIngressRows.length;
  const nBaotaManagedIngresses = baotaIngressRows.filter((row) => row.managed).length;
  const baotaIngressMetric = baotaSummaryLoading
    ? "…"
    : cfg?.k8sConfigured !== true
    ? "需集群"
    : baotaIngressQ.isError
    ? "异常"
    : nBaotaIngresses;
  const baotaManagedIngressMetric = baotaSummaryLoading
    ? "…"
    : cfg?.k8sConfigured !== true
    ? "需集群"
    : baotaIngressQ.isError
    ? "异常"
    : nBaotaManagedIngresses;

  const appCenterSummaryQueries = [
    appStatusQ,
    redisQ,
    mysqlQ,
    kafkaQ,
    cloudVmQ,
    openClawQ,
    hermesQ,
    openSearchQ,
    dnsDomainsQ,
  ];
  const appCenterSummaryLoading = appCenterSummaryQueries.some((query) => query.isLoading || query.isFetching);
  const appCenterMySQLChecking = appStatusQ.isLoading || appStatusQ.isFetching;
  const appCenterMySQLUnavailable = appStatusQ.isError || (appStatusQ.isSuccess && appStatusQ.data?.mysqlReachable === false);
  const appCenterSummaryError = appCenterSummaryQueries.some((query) => query.isError) || appCenterMySQLUnavailable;
  const appCenterStatusTone: HubStatusTone = appCenterSummaryLoading
    ? "slate"
    : appCenterSummaryError
    ? "amber"
    : "emerald";
  const appCenterStatusLabel = appCenterSummaryLoading
    ? "检查中…"
    : appCenterSummaryError
    ? "摘要异常"
    : `${appCenterTotal} 资源`;
  const appCenterStatusIcon = !appCenterSummaryLoading && appCenterSummaryError ? <AlertCircle size={11} /> : undefined;

  const networkDevices = networkDevicesQ.data?.devices ?? [];
  const nNetworkDevices = networkDevices.length;
  const nIkuaiDevices = networkDevices.filter((device) => device.kind === "ikuai").length;
  const nOpenWrtDevices = networkDevices.filter((device) => device.kind === "openwrt").length;
  const networkSummaryError = networkDevicesQ.isError;
  const networkSummaryLoading = networkDevicesQ.isLoading || networkDevicesQ.isFetching;
  const networkNeedsSetup = !networkSummaryLoading && !networkSummaryError && nNetworkDevices === 0;
  const networkIkuaiMetric = queryCountMetric(networkDevicesQ, nIkuaiDevices);
  const networkOpenWrtMetric = queryCountMetric(networkDevicesQ, nOpenWrtDevices);
  const networkDeviceMetric = queryCountMetric(networkDevicesQ, nNetworkDevices);
  const networkDataSourceMetric = networkSummaryLoading
    ? "…"
    : networkDevicesQ.isError
    ? "异常"
    : nNetworkDevices > 0
    ? "已配置"
    : "未配置";
  const openWrtHubHint =
    !networkSummaryLoading && nNetworkDevices === 0
      ? "请先登记 iKuai 或 OpenWrt 设备，工作台会按设备类型汇总接口、终端、无线和监控数据源。"
      : !networkSummaryLoading && nOpenWrtDevices === 0
      ? "OpenWrt 未配置：请先登记 OpenWrt 设备的 Prometheus scope、instance 或 job 标签，避免进入子页后才发现没有数据源。"
      : "";

  // 堡垒机 / 观测与巡检聚合（useMemo：与无关 hub 卡片解耦）
  const {
    nBastionVm,
    nBastionOn,
    nBastionExtra,
    nBastionTargets,
    bastionLoading,
    aiRulesTotal,
    aiRulesOn,
    aiChannels,
    aiReports,
    aiPanels,
    aiProviderEnabled,
    aiPromK8s,
    aiPromVc,
    aiLoading,
  } = useMemo(() => {
    const bastionTargets = bastionTargetsQ.data?.targets ?? [];
    const bVms = bastionTargets.filter((target) => target.provider === "vcenter");
    const nBm = bVms.length;
    const nOn = bVms.filter((v) => String(v.powerState).toLowerCase().includes("on")).length;
    const nExtra = bastionTargets.filter((target) => target.provider === "extra").length;
    const rules = aiAlertsQ.data?.rules ?? [];
    return {
      nBastionVm: nBm,
      nBastionOn: nOn,
      nBastionExtra: nExtra,
      nBastionTargets: bastionTargets.length,
      bastionLoading: bastionTargetsQ.isLoading || bastionTargetsQ.isFetching,
      aiRulesTotal: rules.length,
      aiRulesOn: rules.filter((r) => r.enabled).length,
      aiChannels: aiAlertsQ.data?.channels?.length ?? 0,
      aiReports: aiReportsQ.data?.reports?.length ?? 0,
      aiPanels: aiPanelsQ.data?.panels?.length ?? 0,
      aiProviderEnabled: aiProviderQ.data?.endpoint?.enabled ?? false,
      aiPromK8s: aiPromQ.data?.scopes?.k8s?.configured ?? false,
      aiPromVc: aiPromQ.data?.scopes?.vcenter?.configured ?? false,
      aiLoading:
        aiAlertsQ.isLoading || aiAlertsQ.isFetching ||
        aiProviderQ.isLoading || aiProviderQ.isFetching ||
        aiPanelsQ.isLoading || aiPanelsQ.isFetching ||
        aiReportsQ.isLoading || aiReportsQ.isFetching ||
        aiPromQ.isLoading || aiPromQ.isFetching,
    };
  }, [
    bastionTargetsQ.data?.targets,
    bastionTargetsQ.isLoading,
    bastionTargetsQ.isFetching,
    aiAlertsQ.data?.rules,
    aiAlertsQ.data?.channels,
    aiReportsQ.data?.reports,
    aiPanelsQ.data?.panels,
    aiProviderQ.data?.endpoint,
    aiPromQ.data?.scopes,
    aiAlertsQ.isLoading,
    aiAlertsQ.isFetching,
    aiProviderQ.isLoading,
    aiProviderQ.isFetching,
    aiPanelsQ.isLoading,
    aiPanelsQ.isFetching,
    aiReportsQ.isLoading,
    aiReportsQ.isFetching,
    aiPromQ.isLoading,
    aiPromQ.isFetching,
  ]);

  const appCenterRedisMetric = showAppCenter ? queryCountMetric(redisQ, nRedis) : "受限";
  const appCenterMySQLMetric = showAppCenter ? queryCountMetric(mysqlQ, nMySQL) : "受限";
  const appCenterKafkaMetric = showAppCenter ? queryMySQLBackedCountMetric(kafkaQ, nKafka, appCenterMySQLChecking, appCenterMySQLUnavailable) : "受限";
  const appCenterOpenSearchMetric = showAppCenter ? queryCountMetric(openSearchQ, nOpenSearch) : "受限";
  const appCenterDomainsMetric = showAppCenter ? queryMySQLBackedCountMetric(dnsDomainsQ, nDomains, appCenterMySQLChecking, appCenterMySQLUnavailable) : "受限";
  const appCenterCloudVmMetric = showAppCenter ? queryCountMetric(cloudVmQ, nCloudVm) : "受限";
  const appCenterOpenClawMetric = showAppCenter ? queryCountMetric(openClawQ, nOpenClaw) : "受限";
  const appCenterHermesMetric = showAppCenter ? queryCountMetric(hermesQ, nHermes) : "受限";
  const bastionVmMetric = queryCountMetric(bastionTargetsQ, nBastionVm);
  const bastionExtraHostMetric = queryCountMetric(bastionTargetsQ, nBastionExtra);
  const bastionPowerOnMetric = queryCountMetric(bastionTargetsQ, nBastionOn);
  const bastionReady = nBastionTargets + nCloudVm + nRedis + nMySQL > 0;
  const bastionStatusLoading = bastionLoading || cloudVmQ.isLoading || cloudVmQ.isFetching || redisQ.isLoading || redisQ.isFetching || mysqlQ.isLoading || mysqlQ.isFetching;
  const bastionSummaryError = bastionTargetsQ.isError || cloudVmQ.isError || redisQ.isError || mysqlQ.isError;
  const bastionStatusTone: HubStatusTone = bastionStatusLoading
    ? "slate"
    : bastionSummaryError
    ? "amber"
    : bastionReady
    ? "teal"
    : "amber";
  const bastionStatusLabel = bastionStatusLoading
    ? "检查中…"
    : bastionSummaryError
    ? "摘要异常"
    : bastionReady
    ? "已就绪"
    : "待配置";
  const bastionNeedsSetup = !bastionStatusLoading && !bastionSummaryError && !bastionReady && isAdmin;
  const aiWorkspaceReady =
    aiProviderEnabled ||
    aiPromK8s ||
    aiPromVc ||
    aiPanels > 0 ||
    aiReports > 0 ||
    aiRulesTotal > 0 ||
    aiChannels > 0;
  const aiWorkspaceRestricted = !isAdmin;
  const aiSummaryError = !aiWorkspaceRestricted && (aiAlertsQ.isError || aiProviderQ.isError || aiReportsQ.isError || aiPanelsQ.isError || aiPromQ.isError);
  const aiStatusTone: HubStatusTone = aiWorkspaceRestricted
    ? "slate"
    : aiSummaryError
    ? "amber"
    : aiWorkspaceReady
    ? "cyan"
    : "amber";
  const aiStatusLabel = aiWorkspaceRestricted
    ? "受限视图"
    : aiSummaryError
    ? "摘要异常"
    : aiWorkspaceReady
    ? "已就绪"
    : "待配置";
  const aiNeedsSetup = !aiLoading && !aiWorkspaceRestricted && !aiSummaryError && !aiWorkspaceReady;
  const aiPromK8sMetric = queryConfiguredMetric(aiPromQ, aiPromK8s);
  const aiPromVcMetric = queryConfiguredMetric(aiPromQ, aiPromVc);
  const aiRulesMetric = isAdmin ? queryTextMetric(aiAlertsQ, `${aiRulesOn}/${aiRulesTotal}`) : "受限";
  const aiPanelsMetric = queryCountMetric(aiPanelsQ, aiPanels);
  const aiReportsMetric = isAdmin ? queryCountMetric(aiReportsQ, aiReports) : "受限";
  const aiChannelsMetric = isAdmin ? queryCountMetric(aiAlertsQ, aiChannels) : "受限";
  const nDocsRegular = docsRegularQ.data?.docs?.length ?? 0;
  const nDocsGuides = docsGuidesQ.data?.docs?.length ?? 0;
  const nDocsMedia = docsMediaQ.data?.items?.length ?? 0;
  const docsTotal = nDocsRegular + nDocsGuides;
  const docsLibraryTotal = docsTotal + nDocsMedia;
  const docsReady = docsLibraryTotal > 0;
  const docsSummaryQueries = isAdmin ? [docsRegularQ, docsGuidesQ, docsMediaQ, docsStorageQ] : [docsRegularQ, docsGuidesQ, docsMediaQ];
  const docsSummaryLoading = docsSummaryQueries.some((query) => query.isLoading || query.isFetching);
  const docsSummaryError = docsSummaryQueries.some((query) => query.isError);
  const docsStatusTone: HubStatusTone = docsSummaryLoading
    ? "slate"
    : docsSummaryError
    ? "amber"
    : docsReady
    ? "violet"
    : "amber";
  const docsStatusLabel = docsSummaryLoading
    ? "检查中…"
    : docsSummaryError
    ? "摘要异常"
    : docsReady
    ? `${docsLibraryTotal} 项内容`
    : "待创建";
  const docsStorageMetric = !isAdmin
    ? "受限"
    : docsStorageQ.isLoading || docsStorageQ.isFetching
    ? "…"
    : docsStorageQ.isError
    ? "异常"
    : docsStorageQ.data?.mode === "cos" && docsStorageQ.data.cos?.configured
    ? "COS"
    : "本地";
  const docsRegularMetric = queryCountMetric(docsRegularQ, nDocsRegular);
  const docsGuidesMetric = queryCountMetric(docsGuidesQ, nDocsGuides);
  const docsMediaMetric = queryCountMetric(docsMediaQ, nDocsMedia);
  const hubSummaryControls = [
    runtimeQ,
    ...(showK8s ? [k8sQ] : []),
    ...(showVc ? [vcVmsQ, vcHostsQ, pveTargetsQ] : []),
    ...(appCenterSummaryEnabled
      ? [
          appStatusQ,
          redisQ,
          mysqlQ,
          cloudVmQ,
          openClawQ,
          hermesQ,
          openSearchQ,
        ]
      : []),
    ...(appCenterSummaryEnabled && appStatusQ.data?.mysqlReachable === true ? [kafkaQ, dnsDomainsQ] : []),
    ...(showBastion ? [bastionTargetsQ] : []),
    ...(showNetwork ? [networkDevicesQ] : []),
    ...(baotaIngressSummaryEnabled ? [baotaIngressQ] : []),
    ...(aiInspectSummaryEnabled && isAdmin ? [aiAlertsQ, aiProviderQ, aiReportsQ] : []),
    ...(aiInspectSummaryEnabled ? [aiPanelsQ, aiPromQ] : []),
    ...(docsSummaryEnabled ? [docsRegularQ, docsGuidesQ, docsMediaQ] : []),
    ...(docsSummaryEnabled && isAdmin ? [docsStorageQ] : []),
  ] as const;
  const hubRefreshing = hubSummaryControls.some((query) => query.isFetching);
  const refreshHubSummaries = () => {
    hubSummaryControls.forEach((query) => {
      void query.refetch();
    });
  };

  if (!showHub) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-amber-900/90">暂无可用工作区入口（模块或菜单已关闭）。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">工作台</h1>
          <p className="mt-1 text-sm text-gray-500">各模块配置状态与资源概览，点击卡片进入对应工作区。</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 self-start border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-50"
          disabled={hubRefreshing}
          onClick={refreshHubSummaries}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", hubRefreshing && "animate-spin")} aria-hidden />
          刷新摘要
        </Button>
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Kubernetes */}
        {showK8s && (
          <Link
            to={k8sNeedsSetup ? "/cluster/settings" : "/cluster"}
            className={cn(hubCardClass, "hover:border-blue-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                <Hexagon size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={k8sOk} loading={k8sSummaryLoading} error={k8sSummaryError} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">Kubernetes</h2>
            <p className="mt-0.5 text-xs text-gray-400">集群资源、命名空间与工作负载</p>
            <HubMetricGrid>
              <MetricItem label="节点" value={k8sMetricValue(k8sQ.data?.nodeCount)} />
              <MetricItem label="命名空间" value={k8sMetricValue(k8sQ.data?.namespaceCount)} />
              <MetricItem label="Pod" value={k8sMetricValue(k8sQ.data?.podCount)} />
              <MetricItem label="服务" value={k8sMetricValue(k8sQ.data?.serviceCount)} />
            </HubMetricGrid>
            <HubCardHint>
              {k8sOk || cfgLoading
                ? "展示集群核心资源摘要；进入工作区后可继续查看命名空间、工作负载与服务明细。"
                : "请先在集群设置保存 Kubernetes 连接，摘要会自动切换为实时资源数。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-blue-600")}>
              {k8sNeedsSetup ? "配置集群接入" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 虚拟化与主机 */}
        {showVc && (
          <Link
            to={computeNeedsSetup ? "/cluster/compute/config" : "/cluster/compute/dashboard"}
            className={cn(hubCardClass, "hover:border-violet-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 text-white">
                <Monitor size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={computeOk} loading={computeLoading} error={computeSummaryError} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">虚拟化与主机</h2>
            <p className="mt-0.5 text-xs text-gray-400">vCenter、PVE、公有云与堡垒机</p>
            <HubMetricGrid>
              <MetricItem label="vCenter VM" value={vCenterVmMetric} />
              <MetricItem label="ESXi 主机" value={vCenterHostMetric} />
              <MetricItem label="PVE 目标" value={pveTargetMetric} />
              <MetricItem label="云主机" value={appCenterCloudVmMetric} />
            </HubMetricGrid>
            <HubCardHint>
              {pveHubHint
                ? pveHubHint
                : !computeOk && !computeLoading
                ? "请先配置 vCenter 或新增 PVE 目标，摘要会保持同一版式并显示纳管数量。"
                : vcOk && !vcLoading && vcMemTotalMB > 0
                  ? `宿主机内存 ${fmtMB(vcMemUsedMB)} / ${fmtMB(vcMemTotalMB)}，剩余 ${fmtMB(vcMemFreeMB)}。`
                  : "统一汇总 vCenter、PVE、公有云与堡垒机入口，进入后按平台继续展开操作。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-violet-600")}>
              {computeNeedsSetup ? "配置资源源" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 网络设备 */}
        {showNetwork && (
          <Link
            to={networkNeedsSetup ? "/cluster/network/config" : "/cluster/network/dashboard"}
            className={cn(hubCardClass, "hover:border-cyan-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-slate-700 text-white">
                <Network size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={nNetworkDevices > 0} loading={networkSummaryLoading} error={networkSummaryError} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">网络设备</h2>
            <p className="mt-0.5 text-xs text-gray-400">iKuai、OpenWrt</p>
            <HubMetricGrid>
              <MetricItem label="iKuai" value={networkIkuaiMetric} />
              <MetricItem label="OpenWrt" value={networkOpenWrtMetric} />
              <MetricItem label="纳管设备" value={networkDeviceMetric} />
              <MetricItem label="数据源" value={networkDataSourceMetric} />
            </HubMetricGrid>
            <HubCardHint>
              {openWrtHubHint || "网络设备按 iKuai 与 OpenWrt 分组展示，进入后可查看接口、客户端与监控数据源。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-cyan-700")}>
              {networkNeedsSetup ? "配置网络接入" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 宝塔 */}
        {showBaota && (
          <Link
            to={baotaNeedsSetup ? "/cluster/baota/settings" : "/cluster/baota"}
            className={cn(hubCardClass, "hover:border-amber-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white">
                <Server size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={baotaOk} loading={baotaSummaryLoading} error={baotaSummaryError} errorLabel={baotaStatusErrorLabel} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">宝塔</h2>
            <p className="mt-0.5 text-xs text-gray-400">Ingress 同步、面板 API 与 DDNS</p>
            <HubMetricGrid>
              <MetricItem label="面板 API" value={cfgLoading ? "…" : baotaOk ? (baotaReachable ? "可达" : "异常") : "未配置"} />
              <MetricItem label="DDNS" value={ddnsOk ? "已设置" : "未设置"} />
              <MetricItem label="宝塔实例" value={cfgLoading ? "…" : nBaotaTargets} />
              <MetricItem label="Ingress" value={baotaIngressMetric} />
              <MetricItem label="托管 Ingress" value={baotaManagedIngressMetric} />
            </HubMetricGrid>
            <HubCardHint>
              {baotaIngressQ.isError
                ? "无法读取 Kubernetes Ingress 清单；宝塔面板配置仍可管理，需同步路由时请先检查集群连接。"
                : baotaOk
                ? "同步入口、Ingress 列表与宝塔设置使用同一工作区，未连通时会显示异常状态。"
                : "进入宝塔工作台后会先看到模块 Dashboard，并在其中按需进入宝塔设置。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-amber-700")}>
              {baotaNeedsSetup ? "配置宝塔接入" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 应用中心 */}
        {showAppCenter && (
          <Link
            to="/cluster/apps/dashboard"
            className={cn(hubCardClass, "hover:border-emerald-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
                <AppWindow size={20} strokeWidth={2.2} />
              </div>
              <HubStatusPill
                tone={appCenterStatusTone}
                icon={appCenterStatusIcon}
              >
                {appCenterStatusLabel}
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">应用中心</h2>
            <p className="mt-0.5 text-xs text-gray-400">Redis、MySQL、Kafka、OpenSearch、DNS、容器主机、OpenClaw、Hermes</p>
            <HubMetricGrid columns="grid-cols-3">
              <MetricItem label="Redis" value={appCenterRedisMetric} />
              <MetricItem label="MySQL" value={appCenterMySQLMetric} />
              <MetricItem label="Kafka" value={appCenterKafkaMetric} />
              <MetricItem label="OpenSearch" value={appCenterOpenSearchMetric} />
              <MetricItem label="域名" value={appCenterDomainsMetric} />
              <MetricItem label="容器主机" value={appCenterCloudVmMetric} />
              <MetricItem label="OpenClaw" value={appCenterOpenClawMetric} />
              <MetricItem label="Hermes" value={appCenterHermesMetric} />
            </HubMetricGrid>
            <HubCardHint>
              应用中心摘要按顶部与侧栏同一顺序展示，资源数来自各模块登记数据。
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-emerald-700")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 堡垒机 */}
        {showBastion && (
          <Link
            to={bastionNeedsSetup ? "/cluster/bastion/admin" : "/cluster/bastion"}
            className={cn(hubCardClass, "hover:border-teal-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-800 text-white">
                <SquareTerminal size={20} strokeWidth={2.2} />
              </div>
              <HubStatusPill
                tone={bastionStatusTone}
                icon={(!bastionStatusLoading && (bastionSummaryError || !bastionReady)) ? <AlertCircle size={11} /> : undefined}
              >
                {bastionStatusLabel}
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">堡垒机</h2>
            <p className="mt-0.5 text-xs text-gray-400">统一终端：vCenter SSH/桌面、云主机、Redis CLI 与 MySQL SQL</p>

            <HubMetricGrid>
              <MetricItem label="虚拟机" value={bastionVmMetric} />
              <MetricItem label="额外主机" value={bastionExtraHostMetric} />
              <MetricItem label="ESXi 主机" value={vCenterHostMetric} />
              <MetricItem label="云主机" value={appCenterCloudVmMetric} />
              <MetricItem label="Redis CLI" value={appCenterRedisMetric} />
              <MetricItem label="MySQL SQL" value={appCenterMySQLMetric} />
              <MetricItem label="开机 VM" value={bastionPowerOnMetric} />
            </HubMetricGrid>
            <HubCardHint>
              堡垒机入口统一展示 SSH、远程桌面、Redis CLI 与 MySQL SQL 的可连接目标数量。
            </HubCardHint>

            <span className={cn(hubEntryClass, "text-teal-600")}>
              {bastionNeedsSetup ? "配置堡垒目标" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 观测与巡检 */}
        {showAiInspect && (
          <Link
            to={aiNeedsSetup ? "/cluster/ai-inspect/configure" : "/cluster/ai-inspect/dashboard"}
            className={cn(hubCardClass, "hover:border-cyan-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-700 text-white">
                <Sparkles size={20} strokeWidth={2.2} />
              </div>
              {aiLoading ? (
                <HubStatusPill tone="slate">检查中…</HubStatusPill>
              ) : (
                <HubStatusPill
                  tone={aiStatusTone}
                  icon={!aiWorkspaceRestricted && (aiSummaryError || !aiWorkspaceReady) ? <AlertCircle size={11} /> : undefined}
                >
                  {aiStatusLabel}
                </HubStatusPill>
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">{OBSERVABILITY_INSPECT_WORKSPACE_LABEL}</h2>
            <p className="mt-0.5 text-xs text-gray-400">AI Provider 巡检、监控看板、告警通知、日志检索与巡检报告</p>

            <HubMetricGrid>
              <MetricItem label="K8s 数据源" value={aiPromK8sMetric} />
              <MetricItem label="vCenter 数据源" value={aiPromVcMetric} />
              <MetricItem label="告警规则" value={aiRulesMetric} />
              <MetricItem label="监控面板" value={aiPanelsMetric} />
              <MetricItem label="巡检报告" value={aiReportsMetric} />
              <MetricItem label="通知通道" value={aiChannelsMetric} />
            </HubMetricGrid>
            <HubCardHint>
              观测与巡检摘要统一汇总数据源、监控看板、告警通知、日志检索与巡检报告；配置权限受角色控制。
            </HubCardHint>

            <span className={cn(hubEntryClass, "text-cyan-600")}>
              {aiNeedsSetup ? "配置观测巡检" : "进入"} <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 文档仓库 */}
        {showDocs && (
          <Link
            to="/docs"
            className={cn(hubCardClass, "hover:border-violet-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-violet-800 text-white">
                <Library size={20} strokeWidth={2.2} />
              </div>
              <HubStatusPill
                tone={docsStatusTone}
                icon={!docsSummaryLoading && (docsSummaryError || !docsReady) ? <AlertCircle size={11} /> : undefined}
              >
                {docsStatusLabel}
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">文档仓库</h2>
            <p className="mt-0.5 text-xs text-gray-400">Markdown 笔记、版本、媒体</p>
            <HubMetricGrid>
              <MetricItem label="Markdown" value={docsRegularMetric} />
              <MetricItem label="指南" value={docsGuidesMetric} />
              <MetricItem label="媒体" value={docsMediaMetric} />
              <MetricItem label="附件存储" value={docsStorageMetric} />
            </HubMetricGrid>
            <HubCardHint>
              {docsSummaryError
                ? "文档或媒体摘要接口异常；进入后可继续查看编辑器、媒体库与存储配置的详细错误。"
                : docsReady
                ? "文档仓库汇总笔记、指南与媒体附件，进入后可继续管理版本、附件与公开分享。"
                : "还没有沉淀文档；进入后可创建 Markdown 笔记、指南页，并配置媒体附件存储。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-violet-700")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}
      </div>
    </div>
  );
};

export default HomeHub;
