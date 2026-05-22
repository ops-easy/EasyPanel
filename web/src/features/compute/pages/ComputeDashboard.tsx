import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Database, Monitor, Server, Settings } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type ComputeProvider = {
  provider: "vcenter" | "pve" | string;
  targetId?: string;
  name?: string;
  configured?: boolean;
  hint?: string;
  baseUrl?: string;
};

type ComputeRowsResponse<T extends string> = {
  [key: string]: unknown;
  warnings?: string[];
} & Record<T, unknown[] | undefined>;

const resourceCards = [
  {
    key: "guests",
    label: "虚拟机 / CT",
    desc: "统一进入 VM、QEMU 与 LXC 的详情、控制台、SSH、硬件和快照操作。",
    to: "/cluster/compute/guests",
    icon: Monitor,
    tint: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    key: "hosts",
    label: "宿主机 / 节点",
    desc: "聚合 ESXi 宿主机和 PVE 节点，按运行资源而不是平台入口组织。",
    to: "/cluster/compute/hosts",
    icon: Server,
    tint: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "storage",
    label: "存储",
    desc: "查看 datastore 与 PVE storage 的容量、类型、节点归属和可用状态。",
    to: "/cluster/compute/storage",
    icon: Database,
    tint: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    key: "activity",
    label: "任务活动",
    desc: "汇总 vCenter 事件和 PVE 任务，便于追踪最近的运维动作。",
    to: "/cluster/compute/activity",
    icon: Activity,
    tint: "border-amber-200 bg-amber-50 text-amber-900",
  },
] as const;

function ProviderBadge({ provider }: { provider: ComputeProvider }) {
  const configured = provider.configured === true;
  const label = provider.provider === "vcenter" ? "vCenter" : provider.provider === "pve" ? "PVE" : provider.name || provider.provider;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="truncate text-[11px] text-slate-500" title={provider.baseUrl || provider.hint || ""}>
          {provider.baseUrl || provider.hint || "未填写接入信息"}
        </p>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 font-normal",
          configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"
        )}
      >
        {configured ? "已接入" : "未接入"}
      </Badge>
    </div>
  );
}

function useComputeCount<T extends "guests" | "hosts" | "storage" | "activity">(key: T, enabled: boolean) {
  return useQuery({
    queryKey: ["compute-dashboard-count", key],
    queryFn: ({ signal }) => apiGetJson<ComputeRowsResponse<T>>(`/api/compute/${key}`, { signal }),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

const ComputeDashboard: React.FC = () => {
  const providersQ = useQuery({
    queryKey: ["compute-dashboard-providers"],
    queryFn: ({ signal }) => apiGetJson<{ providers?: ComputeProvider[] }>("/api/compute/providers", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const providers = providersQ.data?.providers ?? [];
  const providerConfigured = providers.some((p) => p.configured === true);
  const guestsQ = useComputeCount("guests", providerConfigured);
  const hostsQ = useComputeCount("hosts", providerConfigured);
  const storageQ = useComputeCount("storage", providerConfigured);
  const activityQ = useComputeCount("activity", providerConfigured);

  const counts = useMemo(
    () => ({
      guests: guestsQ.data?.guests?.length ?? 0,
      hosts: hostsQ.data?.hosts?.length ?? 0,
      storage: storageQ.data?.storage?.length ?? 0,
      activity: activityQ.data?.activity?.length ?? 0,
    }),
    [activityQ.data?.activity?.length, guestsQ.data?.guests?.length, hostsQ.data?.hosts?.length, storageQ.data?.storage?.length]
  );

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-6 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compute Center</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">虚拟主机资源中心</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              日常入口按资源对象组织：先看虚拟机、宿主机、存储和任务活动，再在详情里进入原平台能力。未接入的平台只在配置页出现。
            </p>
          </div>
          <Button asChild className="w-fit gap-2 bg-violet-600 hover:bg-violet-700">
            <Link to={providerConfigured ? "/cluster/compute/guests" : "/cluster/compute/config"}>
              {providerConfigured ? "进入虚拟机" : "打开配置"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {providersQ.isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
            正在读取接入源...
          </div>
        ) : providers.length === 0 ? (
          <ProviderBadge provider={{ provider: "vcenter", name: "vCenter", configured: false }} />
        ) : (
          providers.map((provider) => <ProviderBadge key={`${provider.provider}:${provider.targetId ?? ""}`} provider={provider} />)
        )}
      </section>

      {providerConfigured ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {resourceCards.map(({ key, label, desc, to, icon: Icon, tint }) => (
            <Link
              key={key}
              to={to}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
            >
              <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-lg border", tint)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-slate-950">{label}</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                  {counts[key]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
            </Link>
          ))}
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <Settings className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-900">先接入 vCenter 或 PVE</p>
          <p className="mt-2 text-sm text-slate-500">
            接入完成后，这里会只展示已配置来源的资源入口，不再铺开一堆 PVE 或 vCenter 子页面。
          </p>
          <Button asChild className="mt-4 bg-violet-600 hover:bg-violet-700">
            <Link to="/cluster/compute/config">去配置</Link>
          </Button>
        </section>
      )}
    </div>
  );
};

export default ComputeDashboard;
