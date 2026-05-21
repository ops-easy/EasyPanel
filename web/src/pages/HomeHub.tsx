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
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { apiGetJson } from "@/lib/api";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";
import { cn } from "@/lib/utils";
import { type K8sSummary } from "@/features/cluster/pages/types";
import { type VCenterVMsResponse, type VCenterHostsResponse } from "@/features/vcenter/pages/types";

type RedisStatus = {
  mysqlReachable: boolean;
  encryptionReady: boolean;
  mirrorRedisOk: boolean;
};

type AiAlertsGet = {
  rules: { enabled: boolean }[];
  channels: unknown[];
};

type AiOpenClawGet = {
  openclaw: { enabled: boolean; model?: string; apiKeySet?: boolean };
};

type NetworkDevice = {
  id: string;
  kind: "ikuai" | "openwrt";
};

type PVETarget = {
  id: string;
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

function StatusBadge({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) {
    return <HubStatusPill tone="slate">检查中…</HubStatusPill>;
  }
  return ok ? (
    <HubStatusPill tone="emerald" icon={<CheckCircle2 size={11} />}>
      已接入
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

  const showK8s = menuItemVisible(perm, "kubernetes", hubRole, moduleVisible(perm, "k8s"));
  const showVc = menuItemVisible(perm, "compute", hubRole, moduleVisible(perm, "compute"));
  const showNetwork = menuItemVisible(perm, "network", hubRole, moduleVisible(perm, "network"));
  const showBaota = menuItemVisible(perm, "baota", hubRole, moduleVisible(perm, "baota"));
  const showAppCenter = menuItemVisible(perm, "appcenter", hubRole, moduleVisible(perm, "appcenter"));
  const showBastion = menuItemVisible(
    perm,
    "vcenter_bastion",
    hubRole,
    moduleVisible(perm, "compute") || moduleVisible(perm, "appcenter")
  );
  const showAiInspect = menuItemVisible(perm, "aiInspect", hubRole, true);
  const showDocs = menuItemVisible(perm, "docs", hubRole, true);
  const showHub = menuItemVisible(perm, "hub", hubRole, true);

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
  });
  const redisQ = useQuery({
    queryKey: ["app-center-redis-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/redis/instances", { signal }),
  });
  const kafkaQ = useQuery({
    queryKey: ["app-center-kafka-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/kafka/instances", { signal }),
    enabled: appStatusQ.data?.mysqlReachable === true,
  });
  const cloudVmQ = useQuery({
    queryKey: ["app-center-cloud-vm-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/cloud-vm/instances", { signal }),
  });
  const openClawQ = useQuery({
    queryKey: ["app-center-openclaw-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/openclaw/instances", { signal }),
  });
  const hermesQ = useQuery({
    queryKey: ["app-center-hermes-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/hermes/instances", { signal }),
  });
  const openSearchQ = useQuery({
    queryKey: ["app-center-opensearch-instances-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: unknown[] }>("/api/app-center/opensearch/instances", { signal }),
  });
  const dnsDomainsQ = useQuery({
    queryKey: ["app-center-dns-domains-hub"],
    queryFn: ({ signal }) => apiGetJson<{ domains: unknown[] }>("/api/dns/domains", { signal }),
    enabled: appStatusQ.data?.mysqlReachable === true,
  });

  // 堡垒机
  const bastionVmsQ = useQuery({
    queryKey: ["bastion-vms-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ vms: { moref: string; name: string; powerState?: string }[]; extraHosts?: { id: string }[] }>(
        "/api/vcenter/bastion/vms",
        { signal }
      ),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  // AI 巡检
  const aiAlertsQ = useQuery({
    queryKey: ["ops-alerts-hub"],
    queryFn: ({ signal }) => apiGetJson<AiAlertsGet>("/api/ops/alerts", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const aiOpenClawQ = useQuery({
    queryKey: ["ops-openclaw-hub"],
    queryFn: ({ signal }) => apiGetJson<AiOpenClawGet>("/api/ops/openclaw", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const aiReportsQ = useQuery({
    queryKey: ["ops-inspect-reports-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ reports: unknown[] }>("/api/ops/inspect/reports", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const aiPanelsQ = useQuery({
    queryKey: ["ops-monitoring-panels-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ panels: { id: string }[] }>("/api/ops/monitoring/panels", { signal }),
    enabled: loggedIn,
  });
  const aiPromQ = useQuery({
    queryKey: ["prometheus-status-hub"],
    queryFn: ({ signal }) =>
      apiGetJson<{ scopes?: { k8s?: { configured?: boolean }; vcenter?: { configured?: boolean } } }>(
        "/api/prometheus/status",
        { signal }
      ),
    enabled: loggedIn,
  });

  const networkDevicesQ = useQuery({
    queryKey: ["network-devices-hub"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    enabled: loggedIn && showNetwork,
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
      vcLoading: vcVmsQ.isLoading || vcHostsQ.isLoading,
    };
  }, [vcHostsQ.data?.hosts, vcVmsQ.data?.vms, vcVmsQ.isLoading, vcHostsQ.isLoading]);

  const k8sOk = cfg?.k8sConfigured === true;
  const vcOk = cfg?.vcenterConfigured === true;
  const nPveTargets = pveTargetsQ.data?.targets?.length ?? 0;
  const computeOk = vcOk || nPveTargets > 0;
  const computeLoading = cfgLoading || (!vcOk && pveTargetsQ.isLoading);
  const k8sMetricValue = (value?: number): number | string => {
    if (cfgLoading) return "…";
    if (!k8sOk) return 0;
    if (k8sQ.isLoading) return "…";
    return value ?? "—";
  };
  const baotaTargetOk = cfg?.baotaTargets?.some((t) => Boolean(t.url && t.hasApiKey)) ?? false;
  const baotaOk = Boolean((cfg?.hasBaotaApiKey && cfg?.baotaUrl) || baotaTargetOk);
  const baotaReachable = check?.baota.status === "success";
  const nBaotaTargets = cfg?.baotaTargets?.filter((t) => Boolean(t.url && t.hasApiKey)).length ?? (baotaOk ? 1 : 0);
  const ddnsOk = Boolean(cfg?.ddnsHost?.trim());
  const baotaEntryTo = baotaOk ? "/cluster/baota/sync" : "/cluster/baota/settings";

  const { nRedis, nKafka, nCloudVm, nOpenClaw, nHermes, nOpenSearch, nDomains, appCenterTotal } = useMemo(() => {
    const nr = redisQ.data?.instances?.length ?? 0;
    const nk = kafkaQ.data?.instances?.length ?? 0;
    const nc = cloudVmQ.data?.instances?.length ?? 0;
    const no = openClawQ.data?.instances?.length ?? 0;
    const nh = hermesQ.data?.instances?.length ?? 0;
    const nos = openSearchQ.data?.instances?.length ?? 0;
    const nd = dnsDomainsQ.data?.domains?.length ?? 0;
    return {
      nRedis: nr,
      nKafka: nk,
      nCloudVm: nc,
      nOpenClaw: no,
      nHermes: nh,
      nOpenSearch: nos,
      nDomains: nd,
      appCenterTotal: nr + nk + nc + no + nh + nos,
    };
  }, [
    redisQ.data?.instances,
    kafkaQ.data?.instances,
    cloudVmQ.data?.instances,
    openClawQ.data?.instances,
    hermesQ.data?.instances,
    openSearchQ.data?.instances,
    dnsDomainsQ.data?.domains,
  ]);

  const networkDevices = networkDevicesQ.data?.devices ?? [];
  const nNetworkDevices = networkDevices.length;
  const nIkuaiDevices = networkDevices.filter((device) => device.kind === "ikuai").length;
  const nOpenWrtDevices = networkDevices.filter((device) => device.kind === "openwrt").length;

  // 堡垒机 / AI 巡检聚合（useMemo：与无关 hub 卡片解耦）
  const {
    nBastionVm,
    nBastionOn,
    nBastionExtra,
    nBastionDirect,
    bastionLoading,
    aiRulesTotal,
    aiRulesOn,
    aiChannels,
    aiReports,
    aiPanels,
    aiOcEnabled,
    aiOcModel,
    aiPromK8s,
    aiPromVc,
    aiLoading,
  } = useMemo(() => {
    const bVms = bastionVmsQ.data?.vms ?? [];
    const nBm = bVms.length;
    const nOn = bVms.filter((v) => String(v.powerState).toLowerCase().includes("on")).length;
    const nExtra = bastionVmsQ.data?.extraHosts?.length ?? 0;
    /** 堡垒机策略内：同步 VM + 手工额外主机（不含 ESXi/云主机/Redis，避免与下方明细重复计数） */
    const nBastionDirect = nBm + nExtra;
    const rules = aiAlertsQ.data?.rules ?? [];
    return {
      nBastionVm: nBm,
      nBastionOn: nOn,
      nBastionExtra: nExtra,
      nBastionDirect,
      bastionLoading: bastionVmsQ.isLoading,
      aiRulesTotal: rules.length,
      aiRulesOn: rules.filter((r) => r.enabled).length,
      aiChannels: aiAlertsQ.data?.channels?.length ?? 0,
      aiReports: aiReportsQ.data?.reports?.length ?? 0,
      aiPanels: aiPanelsQ.data?.panels?.length ?? 0,
      aiOcEnabled: aiOpenClawQ.data?.openclaw?.enabled ?? false,
      aiOcModel: aiOpenClawQ.data?.openclaw?.model,
      aiPromK8s: aiPromQ.data?.scopes?.k8s?.configured ?? false,
      aiPromVc: aiPromQ.data?.scopes?.vcenter?.configured ?? false,
      aiLoading: aiAlertsQ.isLoading || aiOpenClawQ.isLoading || aiPanelsQ.isLoading,
    };
  }, [
    bastionVmsQ.data?.vms,
    bastionVmsQ.data?.extraHosts,
    bastionVmsQ.isLoading,
    aiAlertsQ.data?.rules,
    aiAlertsQ.data?.channels,
    aiReportsQ.data?.reports,
    aiPanelsQ.data?.panels,
    aiOpenClawQ.data?.openclaw,
    aiPromQ.data?.scopes,
    aiAlertsQ.isLoading,
    aiOpenClawQ.isLoading,
    aiPanelsQ.isLoading,
  ]);

  if (!showHub) {
    return (
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-amber-900/90">暂无可用工作区入口（模块或菜单已关闭）。</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">工作台</h1>
        <p className="mt-1 text-sm text-gray-500">各模块接入状态与资源概览，点击卡片进入对应工作区。</p>
      </div>

      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Kubernetes */}
        {showK8s && (
          <Link
            to="/cluster"
            className={cn(hubCardClass, "hover:border-blue-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                <Hexagon size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={k8sOk} loading={cfgLoading} />
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
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 虚拟化与主机 */}
        {showVc && (
          <Link
            to="/cluster/compute/dashboard"
            className={cn(hubCardClass, "hover:border-violet-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-violet-700 text-white">
                <Monitor size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={computeOk} loading={computeLoading} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">虚拟化与主机</h2>
            <p className="mt-0.5 text-xs text-gray-400">vCenter、PVE、公有云与堡垒机</p>
            <HubMetricGrid>
              <MetricItem label="vCenter VM" value={!vcOk || vcLoading ? (vcLoading ? "…" : 0) : nVcVm} />
              <MetricItem label="ESXi 主机" value={!vcOk || vcLoading ? (vcLoading ? "…" : 0) : nVcHost} />
              <MetricItem label="PVE 目标" value={pveTargetsQ.isLoading ? "…" : nPveTargets} />
              <MetricItem label="云主机" value={cloudVmQ.isLoading ? "…" : nCloudVm} />
            </HubMetricGrid>
            <HubCardHint>
              {!computeOk && !computeLoading
                ? "请先接入 vCenter 或新增 PVE 目标，摘要会保持同一版式并显示纳管数量。"
                : vcOk && !vcLoading && vcMemTotalMB > 0
                  ? `宿主机内存 ${fmtMB(vcMemUsedMB)} / ${fmtMB(vcMemTotalMB)}，剩余 ${fmtMB(vcMemFreeMB)}。`
                  : "统一汇总 vCenter、PVE、公有云与堡垒机入口，进入后按平台继续展开操作。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-violet-600")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 网络设备 */}
        {showNetwork && (
          <Link
            to="/cluster/network/dashboard"
            className={cn(hubCardClass, "hover:border-cyan-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-slate-700 text-white">
                <Network size={20} strokeWidth={2.2} />
              </div>
              <HubStatusPill
                tone={networkDevicesQ.isLoading || nNetworkDevices === 0 ? "slate" : "cyan"}
              >
                {networkDevicesQ.isLoading ? "加载中..." : `${nNetworkDevices} 设备`}
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">网络设备</h2>
            <p className="mt-0.5 text-xs text-gray-400">iKuai、OpenWrt</p>
            <HubMetricGrid>
              <MetricItem label="iKuai" value={networkDevicesQ.isLoading ? "…" : nIkuaiDevices} />
              <MetricItem label="OpenWrt" value={networkDevicesQ.isLoading ? "…" : nOpenWrtDevices} />
              <MetricItem label="纳管设备" value={networkDevicesQ.isLoading ? "…" : nNetworkDevices} />
              <MetricItem label="数据源" value={nNetworkDevices > 0 ? "已接入" : "待接入"} />
            </HubMetricGrid>
            <HubCardHint>
              网络设备按 iKuai 与 OpenWrt 分组展示，进入后可查看接口、客户端与监控数据源。
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-cyan-700")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 宝塔 */}
        {showBaota && (
          <Link
            to={baotaEntryTo}
            className={cn(hubCardClass, "hover:border-amber-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 text-white">
                <Server size={20} strokeWidth={2.2} />
              </div>
              <StatusBadge ok={baotaOk} loading={cfgLoading} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">宝塔</h2>
            <p className="mt-0.5 text-xs text-gray-400">Ingress 同步、面板 API 与 DDNS</p>
            <HubMetricGrid>
              <MetricItem label="面板 API" value={cfgLoading ? "…" : baotaOk ? (baotaReachable ? "可达" : "异常") : "未配置"} />
              <MetricItem label="DDNS" value={ddnsOk ? "已设置" : "未设置"} />
              <MetricItem label="宝塔实例" value={cfgLoading ? "…" : nBaotaTargets} />
              <MetricItem label="Ingress" value={baotaOk ? "可同步" : "待配置"} />
            </HubMetricGrid>
            <HubCardHint>
              {baotaOk
                ? "同步入口、Ingress 列表与宝塔设置使用同一工作区，未连通时会显示异常状态。"
                : "默认地址只是占位；填写宝塔面板地址与 API Key 后才会启用同步。"}
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-amber-700")}>
              {baotaOk ? "进入" : "去配置"} <ArrowRight size={13} />
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
              <HubStatusPill tone="emerald">
                {appCenterTotal} 实例
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">应用中心</h2>
            <p className="mt-0.5 text-xs text-gray-400">Redis、Kafka、OpenSearch、DNS、容器主机、OpenClaw、Hermes</p>
            <HubMetricGrid columns="grid-cols-3">
              <MetricItem label="Redis" value={nRedis} />
              <MetricItem label="Kafka" value={nKafka} />
              <MetricItem label="OpenSearch" value={nOpenSearch} />
              <MetricItem label="域名" value={nDomains} />
              <MetricItem label="容器主机" value={nCloudVm} />
              <MetricItem label="OpenClaw" value={nOpenClaw} />
              <MetricItem label="Hermes" value={nHermes} />
            </HubMetricGrid>
            <HubCardHint>
              应用中心摘要按顶部与侧栏同一顺序展示，实例数来自各模块登记数据。
            </HubCardHint>
            <span className={cn(hubEntryClass, "text-emerald-700")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* 堡垒机 */}
        {showBastion && (
          <Link
            to="/cluster/bastion"
            className={cn(hubCardClass, "hover:border-teal-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-600 to-emerald-800 text-white">
                <SquareTerminal size={20} strokeWidth={2.2} />
              </div>
              <HubStatusPill tone={bastionLoading || nBastionDirect === 0 ? "slate" : "teal"}>
                {bastionLoading ? "加载中…" : `${nBastionDirect} 台堡垒目标`}
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">堡垒机</h2>
            <p className="mt-0.5 text-xs text-gray-400">统一终端：vCenter SSH/桌面、云主机与 Redis CLI</p>

            <HubMetricGrid>
              <MetricItem label="虚拟机" value={bastionLoading ? "…" : nBastionVm} />
              <MetricItem label="额外主机" value={bastionLoading ? "…" : nBastionExtra} />
              <MetricItem label="ESXi 主机" value={vcLoading ? "…" : nVcHost} />
              <MetricItem label="云主机" value={cloudVmQ.isLoading ? "…" : nCloudVm} />
              <MetricItem label="Redis CLI" value={redisQ.isLoading ? "…" : nRedis} />
              <MetricItem label="开机 VM" value={bastionLoading ? "…" : nBastionOn} />
            </HubMetricGrid>
            <HubCardHint>
              堡垒机入口统一展示 SSH、远程桌面与 Redis CLI 的可连接目标数量。
            </HubCardHint>

            <span className={cn(hubEntryClass, "text-teal-600")}>
              进入 <ArrowRight size={13} />
            </span>
          </Link>
        )}

        {/* AI 巡检 */}
        {showAiInspect && (
          <Link
            to="/cluster/ai-inspect/dashboard"
            className={cn(hubCardClass, "hover:border-cyan-200")}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-700 text-white">
                <Sparkles size={20} strokeWidth={2.2} />
              </div>
              {aiLoading ? (
                <HubStatusPill tone="slate">检查中…</HubStatusPill>
              ) : isAdmin ? (
                <HubStatusPill tone={aiOcEnabled ? "cyan" : "slate"}>
                  {aiOcEnabled ? `大模型 ${aiOcModel ? `· ${aiOcModel}` : "已启用"}` : "大模型未启用"}
                </HubStatusPill>
              ) : (
                <HubStatusPill tone="cyan">已就绪</HubStatusPill>
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">AI 巡检</h2>
            <p className="mt-0.5 text-xs text-gray-400">OpenClaw 巡检、监控告警、日志查询与采集</p>

            <HubMetricGrid>
              <MetricItem label="K8s 数据源" value={aiLoading ? "…" : aiPromK8s ? "已配置" : "未配置"} />
              <MetricItem label="vCenter 数据源" value={aiLoading ? "…" : aiPromVc ? "已配置" : "未配置"} />
              <MetricItem label="告警规则" value={isAdmin ? (aiLoading ? "…" : `${aiRulesOn}/${aiRulesTotal}`) : "受限"} />
              <MetricItem label="监控面板" value={aiLoading ? "…" : aiPanels} />
              <MetricItem label="巡检报告" value={isAdmin ? (aiLoading ? "…" : aiReports) : "受限"} />
              <MetricItem label="通知通道" value={isAdmin ? (aiLoading ? "…" : aiChannels) : "受限"} />
            </HubMetricGrid>
            <HubCardHint>
              AI 巡检摘要统一汇总数据源、告警、监控面板和报告；配置权限受角色控制。
            </HubCardHint>

            <span className={cn(hubEntryClass, "text-cyan-600")}>
              进入 <ArrowRight size={13} />
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
              <HubStatusPill tone="violet">
                文档中心
              </HubStatusPill>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">文档仓库</h2>
            <p className="mt-0.5 text-xs text-gray-400">Markdown 笔记、版本、媒体</p>
            <HubMetricGrid>
              <MetricItem label="Markdown" value="可用" />
              <MetricItem label="版本" value="可用" />
              <MetricItem label="媒体" value="可用" />
              <MetricItem label="分享" value="可用" />
            </HubMetricGrid>
            <HubCardHint>
              文档仓库使用同一工作台卡片样式，进入后可管理笔记、历史版本、附件与公开分享。
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
