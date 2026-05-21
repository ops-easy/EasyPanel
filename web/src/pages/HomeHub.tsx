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
  Database,
  HardDrive,
  Bot,
  Search,
  Globe,
  Layers,
  Cpu,
  Bell,
  LineChart,
  FileText,
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

function StatusBadge({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
        检查中…
      </span>
    );
  }
  return ok ? (
    <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
      <CheckCircle2 size={11} />
      已接入
    </span>
  ) : (
    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <AlertCircle size={11} />
      待配置
    </span>
  );
}

function MetricItem({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] leading-none text-gray-400">{label}</span>
      <span className="mt-0.5 text-lg font-semibold tabular-nums leading-none text-gray-900">
        {value}
      </span>
    </div>
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

  const cfgLoading = runtimeQ.isLoading;

  // K8s summary
  const k8sQ = useQuery({
    queryKey: ["k8s-summary-hub"],
    queryFn: ({ signal }) => apiGetJson<K8sSummary>("/api/k8s/summary", { signal }),
    enabled: cfg?.k8sConfigured === true,
  });

  // vCenter
  const vcVmsQ = useQuery({
    queryKey: ["vcenter-vms-hub"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: cfg?.vcenterConfigured === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const vcHostsQ = useQuery({
    queryKey: ["vcenter-hosts-hub"],
    queryFn: ({ signal }) => apiGetJson<VCenterHostsResponse>("/api/vcenter/hosts", { signal }),
    enabled: cfg?.vcenterConfigured === true,
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
  const isAdmin = authStatus?.role === "admin";
  const loggedIn = Boolean(authStatus?.loggedIn);
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

  const networkDevicesQ = useQuery({
    queryKey: ["network-devices-hub"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    enabled: loggedIn && showNetwork,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const hubCardClass =
    "group flex h-[340px] min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:shadow-md";
  const hubEntryClass = "mt-auto inline-flex items-center gap-1 pt-3 text-xs font-medium group-hover:underline";

  // vCenter aggregated stats（useMemo：避免无关 query 更新时重复 reduce）
  const {
    vcHosts,
    vcMemTotalMB,
    vcMemUsedMB,
    vcMemFreeMB,
    vcMemUsedPct,
    nVcVm,
    nVcHost,
    vcLoading,
  } = useMemo(() => {
    const hosts = vcHostsQ.data?.hosts ?? [];
    const memTotal = hosts.reduce((s, h) => s + (h.memoryTotalMB ?? 0), 0);
    const memUsed = hosts.reduce((s, h) => s + (h.memoryUsageMB ?? 0), 0);
    const memFree = memTotal - memUsed;
    return {
      vcHosts: hosts,
      vcMemTotalMB: memTotal,
      vcMemUsedMB: memUsed,
      vcMemFreeMB: memFree,
      vcMemUsedPct: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
      nVcVm: vcVmsQ.data?.vms?.length ?? 0,
      nVcHost: hosts.length,
      vcLoading: vcVmsQ.isLoading || vcHostsQ.isLoading,
    };
  }, [vcHostsQ.data?.hosts, vcVmsQ.data?.vms, vcVmsQ.isLoading, vcHostsQ.isLoading]);

  const k8sOk = cfg?.k8sConfigured === true;
  const vcOk = cfg?.vcenterConfigured === true;
  const baotaTargetOk = cfg?.baotaTargets?.some((t) => Boolean(t.url && t.hasApiKey)) ?? false;
  const baotaOk = Boolean((cfg?.hasBaotaApiKey && cfg?.baotaUrl) || baotaTargetOk);
  const baotaReachable = check?.baota.status === "success";
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
            {k8sOk && (
              <div className="mt-4 flex gap-5 border-t border-gray-100 pt-4">
                <MetricItem label="节点" value={k8sQ.isLoading ? "…" : (k8sQ.data?.nodeCount ?? "—")} />
                <MetricItem label="命名空间" value={k8sQ.isLoading ? "…" : (k8sQ.data?.namespaceCount ?? "—")} />
                <MetricItem label="Pod" value={k8sQ.isLoading ? "…" : (k8sQ.data?.podCount ?? "—")} />
                <MetricItem label="服务" value={k8sQ.isLoading ? "…" : (k8sQ.data?.serviceCount ?? "—")} />
              </div>
            )}
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
              <StatusBadge ok={vcOk} loading={cfgLoading} />
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">虚拟化与主机</h2>
            <p className="mt-0.5 text-xs text-gray-400">vCenter、PVE、公有云与堡垒机</p>
            {vcOk && (
              <>
                <div className="mt-4 flex gap-5 border-t border-gray-100 pt-4">
                  <MetricItem label="虚拟机" value={vcLoading ? "…" : nVcVm} />
                  <MetricItem label="宿主机" value={vcLoading ? "…" : nVcHost} />
                  {!vcLoading && vcMemTotalMB > 0 && (
                    <MetricItem label="内存使用率" value={`${vcMemUsedPct}%`} />
                  )}
                </div>
                {!vcLoading && vcMemTotalMB > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-gray-400">
                      <span className="flex items-center gap-1">
                        <Cpu size={10} />
                        宿主机内存
                      </span>
                      <span>{fmtMB(vcMemUsedMB)} / {fmtMB(vcMemTotalMB)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          vcMemUsedPct >= 85
                            ? "bg-red-500"
                            : vcMemUsedPct >= 70
                              ? "bg-amber-400"
                              : "bg-violet-500"
                        )}
                        style={{ width: `${vcMemUsedPct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400">
                      剩余 <span className="font-medium text-gray-600">{fmtMB(vcMemFreeMB)}</span>
                    </p>
                  </div>
                )}
              </>
            )}
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
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  networkDevicesQ.isLoading
                    ? "bg-slate-100 text-slate-400"
                    : nNetworkDevices > 0
                      ? "bg-cyan-50 text-cyan-700"
                      : "bg-slate-100 text-slate-500"
                )}
              >
                {networkDevicesQ.isLoading ? "加载中..." : `${nNetworkDevices} 设备`}
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">网络设备</h2>
            <p className="mt-0.5 text-xs text-gray-400">iKuai、OpenWrt</p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <Network size={13} className="shrink-0 text-cyan-500" />
                <div>
                  <p className="text-[10px] text-gray-400">iKuai</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {networkDevicesQ.isLoading ? "..." : nIkuaiDevices}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe size={13} className="shrink-0 text-emerald-500" />
                <div>
                  <p className="text-[10px] text-gray-400">OpenWrt</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">
                    {networkDevicesQ.isLoading ? "..." : nOpenWrtDevices}
                  </p>
                </div>
              </div>
            </div>
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
            {baotaOk ? (
              <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    cfgLoading ? "bg-slate-300" : baotaReachable ? "bg-emerald-500" : "bg-amber-400"
                  )}
                />
                <span className="text-xs text-gray-500">
                  {cfgLoading ? "检查中…" : baotaReachable ? "面板可达" : "面板不可达"}
                </span>
              </div>
            ) : (
              <div className="mt-4 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
                默认地址只是占位；填写宝塔面板地址与 API Key 后才会启用同步。
              </div>
            )}
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
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                {appCenterTotal} 实例
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">应用中心</h2>
            <p className="mt-0.5 text-xs text-gray-400">Redis、Kafka、云主机、OpenClaw、Hermes、OpenSearch、DNS</p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <Database size={13} className="shrink-0 text-slate-400" />
                <div>
                  <p className="text-[10px] text-gray-400">Redis</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nRedis}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="shrink-0 text-violet-400" />
                <div>
                  <p className="text-[10px] text-gray-400">Kafka</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nKafka}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <HardDrive size={13} className="shrink-0 text-slate-400" />
                <div>
                  <p className="text-[10px] text-gray-400">云主机</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nCloudVm}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Bot size={13} className="shrink-0 text-violet-400" />
                <div>
                  <p className="text-[10px] text-gray-400">OpenClaw</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nOpenClaw}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Sparkles size={13} className="shrink-0 text-fuchsia-400" />
                <div>
                  <p className="text-[10px] text-gray-400">Hermes</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nHermes}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Search size={13} className="shrink-0 text-slate-400" />
                <div>
                  <p className="text-[10px] text-gray-400">OpenSearch</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nOpenSearch}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe size={13} className="shrink-0 text-emerald-400" />
                <div>
                  <p className="text-[10px] text-gray-400">域名</p>
                  <p className="text-sm font-semibold tabular-nums text-gray-900">{nDomains}</p>
                </div>
              </div>
            </div>
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
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                bastionLoading
                  ? "bg-slate-100 text-slate-400"
                  : nBastionDirect > 0
                    ? "bg-teal-50 text-teal-700"
                    : "bg-slate-100 text-slate-500"
              )}>
                {bastionLoading ? "加载中…" : `${nBastionDirect} 台堡垒目标`}
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">堡垒机</h2>
            <p className="mt-0.5 text-xs text-gray-400">统一终端：vCenter SSH/桌面、云主机与 Redis CLI</p>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-gray-100 pt-4">
              {/* vCenter 虚拟机 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Monitor size={12} className="shrink-0 text-violet-400" />
                  <span className="text-[11px] text-gray-400">虚拟机</span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {bastionLoading ? "…" : nBastionVm}
                  </span>
                  {!bastionLoading && nBastionVm > 0 && (
                    <span className="ml-1 text-[10px] text-emerald-600">
                      {nBastionOn} 开机
                    </span>
                  )}
                </div>
              </div>

              {/* 额外主机 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <HardDrive size={12} className="shrink-0 text-slate-400" />
                  <span className="text-[11px] text-gray-400">额外主机</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {bastionLoading ? "…" : nBastionExtra}
                </span>
              </div>

              {/* ESXi 宿主机 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Server size={12} className="shrink-0 text-slate-400" />
                  <span className="text-[11px] text-gray-400">ESXi 主机</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {vcLoading ? "…" : nVcHost}
                </span>
              </div>

              {/* 云主机 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe size={12} className="shrink-0 text-emerald-400" />
                  <span className="text-[11px] text-gray-400">云主机</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {cloudVmQ.isLoading ? "…" : nCloudVm}
                </span>
              </div>

              {/* Redis CLI */}
              <div className="col-span-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Database size={12} className="shrink-0 text-red-400" />
                  <span className="text-[11px] text-gray-400">Redis CLI 入口</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-gray-900">
                  {redisQ.isLoading ? "…" : nRedis}
                </span>
              </div>
            </div>

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
              {/* 大模型状态徽章 */}
              {aiLoading ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-400">检查中…</span>
              ) : isAdmin ? (
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  aiOcEnabled ? "bg-cyan-50 text-cyan-700" : "bg-slate-100 text-slate-500"
                )}>
                  {aiOcEnabled ? `大模型 ${aiOcModel ? `· ${aiOcModel}` : "已启用"}` : "大模型未启用"}
                </span>
              ) : (
                <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[11px] font-semibold text-cyan-700">已就绪</span>
              )}
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">AI 巡检</h2>
            <p className="mt-0.5 text-xs text-gray-400">OpenClaw 巡检、监控告警、日志查询与采集</p>

            {/* 数据源状态 */}
            <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", aiLoading ? "bg-slate-300" : aiPromK8s ? "bg-emerald-500" : "bg-slate-300")} />
                <span className="text-[11px] text-gray-400">K8s</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full", aiLoading ? "bg-slate-300" : aiPromVc ? "bg-emerald-500" : "bg-slate-300")} />
                <span className="text-[11px] text-gray-400">vCenter</span>
              </div>
              <span className="ml-auto text-[11px] text-gray-400">Prometheus 数据源</span>
            </div>

            {/* 统计网格 */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {isAdmin && (
                <>
                  {/* 告警规则 */}
                  <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
                    <Bell size={14} className="shrink-0 text-amber-500" />
                    <div>
                      <p className="text-[10px] text-gray-400">告警规则</p>
                      <p className="text-sm font-semibold tabular-nums text-gray-900">
                        {aiLoading ? "…" : `${aiRulesOn} / ${aiRulesTotal}`}
                      </p>
                      <p className="text-[10px] text-gray-400">启用 / 共</p>
                    </div>
                  </div>

                  {/* 通知通道 + 巡检报告 */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <LineChart size={12} className="shrink-0 text-cyan-500" />
                        <span className="text-[10px] text-gray-400">自定义面板</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        {aiLoading ? "…" : aiPanels}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText size={12} className="shrink-0 text-teal-500" />
                        <span className="text-[10px] text-gray-400">巡检报告</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        {aiLoading ? "…" : aiReports}
                      </span>
                    </div>
                  </div>

                  {/* 告警规则启用率进度条 */}
                  {aiRulesTotal > 0 && (
                    <div className="col-span-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span>告警规则启用率</span>
                        <span>{Math.round((aiRulesOn / aiRulesTotal) * 100)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all"
                          style={{ width: `${Math.round((aiRulesOn / aiRulesTotal) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-400">
                        {aiChannels} 个通知通道
                      </p>
                    </div>
                  )}
                </>
              )}

              {!isAdmin && (
                <div className="col-span-2 flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
                  <LineChart size={14} className="shrink-0 text-cyan-500" />
                  <div>
                    <p className="text-[10px] text-gray-400">自定义监控面板</p>
                    <p className="text-sm font-semibold tabular-nums text-gray-900">
                      {aiLoading ? "…" : aiPanels}
                    </p>
                  </div>
                </div>
              )}
            </div>

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
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                文档中心
              </span>
            </div>
            <h2 className="mt-4 text-base font-semibold text-gray-900">文档仓库</h2>
            <p className="mt-0.5 text-xs text-gray-400">Markdown 笔记、版本、媒体</p>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-1.5">
                <FileText size={13} className="shrink-0 text-violet-500" />
                <span className="text-[10px] text-gray-400">Markdown</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="shrink-0 text-slate-500" />
                <span className="text-[10px] text-gray-400">版本</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Library size={13} className="shrink-0 text-zinc-500" />
                <span className="text-[10px] text-gray-400">媒体</span>
              </div>
            </div>
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
