import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, ArrowRight, Database, Monitor, Server, Settings } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { apiGetJson } from "@/lib/api";
import ComputePageHeader from "@/features/compute/components/ComputePageHeader";
import ComputeProviderHealthStrip from "@/features/compute/components/ComputeProviderHealthStrip";
import ComputeStatusBadge from "@/features/compute/components/ComputeStatusBadge";
import type { ComputeProvider } from "@/features/compute/components/compute-resource-types";
import { cn } from "@/lib/utils";

type ComputeSummaryCounts = {
  guests?: number;
  hosts?: number;
  storage?: number;
  activity?: number;
  warnings?: number;
};

type ComputeSummaryHealth = {
  ok?: number;
  idle?: number;
  warning?: number;
  critical?: number;
  unknown?: number;
};

type ComputeSummaryItem = {
  kind?: string;
  provider?: string;
  resourceId?: string | number;
  name?: string;
  health?: string;
  status?: string;
};

type ComputeSummaryResponse = {
  providers?: ComputeProvider[];
  counts?: ComputeSummaryCounts;
  health?: ComputeSummaryHealth;
  hotspots?: ComputeSummaryItem[];
  recentFailures?: ComputeSummaryItem[];
  warnings?: string[];
  warningCount?: number;
};

type ComputeProvidersResponse = {
  providers?: ComputeProvider[];
  warnings?: string[];
};

const resourceCards = [
  {
    key: "guests",
    label: "虚拟机 / CT",
    desc: "查看电源状态、节点、IP、规格，并进入控制台、SSH、硬件和快照操作。",
    to: "/cluster/compute/guests",
    icon: Monitor,
    tint: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    key: "hosts",
    label: "宿主机 / 节点",
    desc: "聚合 ESXi 宿主机和 PVE 节点，优先发现连接和资源压力。",
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
    desc: "汇总 vCenter 事件和 PVE 任务，追踪失败、变更和近期运维动作。",
    to: "/cluster/compute/activity",
    icon: Activity,
    tint: "border-amber-200 bg-amber-50 text-amber-900",
  },
] as const;

function countText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function MiniMetric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={cn("mt-1 text-lg font-semibold tabular-nums text-slate-950", tone)}>{value}</p>
    </div>
  );
}

function SummaryList({ title, empty, items }: { title: string; empty: string; items: ComputeSummaryItem[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 6).map((item, index) => (
            <div key={`${item.provider}:${item.resourceId}:${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-950">{item.name || item.resourceId || "-"}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {item.provider || "未知来源"} · {item.kind || "resource"}
                </p>
              </div>
              <ComputeStatusBadge status={item.status} health={item.health} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const ComputeDashboard: React.FC = () => {
  const providersQ = useQuery({
    queryKey: ["compute-dashboard-providers"],
    queryFn: ({ signal }) => apiGetJson<ComputeProvidersResponse>("/api/compute/providers", { signal }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const summaryQ = useQuery({
    queryKey: ["compute-dashboard-summary"],
    queryFn: ({ signal }) => apiGetJson<ComputeSummaryResponse>("/api/compute/summary", { signal }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const summary = summaryQ.data;
  const providers = providersQ.data?.providers ?? summary?.providers ?? [];
  const providerConfigured = providers.some((provider) => provider.configured === true);
  const counts = summary?.counts ?? {};
  const health = summary?.health ?? {};
  const abnormalCount = (health.warning ?? 0) + (health.critical ?? 0);
  const warnings = [...(providersQ.data?.warnings ?? []), ...(summary?.warnings ?? [])];

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-10">
      <ComputePageHeader
        eyebrow="Compute Center"
        title="虚拟主机资源中心"
        description="面向日常运维的统一入口：先看接入源健康、异常资源、容量热点和最近活动，再进入虚拟机、宿主机、存储和任务活动。"
        refreshing={summaryQ.isFetching || providersQ.isFetching}
        onRefresh={() => {
          void providersQ.refetch();
          void summaryQ.refetch();
        }}
        action={
          <Button asChild className="h-9 gap-2 bg-violet-600 hover:bg-violet-700">
            <Link to={providerConfigured ? "/cluster/compute/guests" : "/cluster/compute/config"}>
              {providerConfigured ? "进入虚拟机" : "打开配置"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <ComputeProviderHealthStrip providers={providers} loading={summaryQ.isLoading || providersQ.isLoading} warnings={warnings} />

      {!providerConfigured && !summaryQ.isLoading ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <Settings className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-900">先接入 vCenter 或 PVE</p>
          <p className="mt-2 text-sm text-slate-500">接入后这里会展示资源状态、容量热点和最近活动。</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link to="/cluster/compute/config">配置接入源</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/cluster/compute/config">配置监控数据源</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MiniMetric label="虚拟机 / CT" value={countText(counts.guests)} />
        <MiniMetric label="宿主机 / 节点" value={countText(counts.hosts)} />
        <MiniMetric label="存储" value={countText(counts.storage)} />
        <MiniMetric label="最近活动" value={countText(counts.activity)} />
        <MiniMetric label="异常资源" value={abnormalCount} tone={abnormalCount > 0 ? "text-rose-700" : "text-emerald-700"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SummaryList title="容量热点" empty="暂无需要关注的宿主机或存储压力。" items={summary?.hotspots ?? []} />
        <SummaryList title="最近活动" empty="暂无失败任务或异常事件。" items={summary?.recentFailures ?? []} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {resourceCards.map(({ key, label, desc, to, icon: Icon, tint }) => (
          <Link
            key={key}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-lg border", tint)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">{label}</h2>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                {countText(counts[key])}
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
          </Link>
        ))}
      </section>
    </div>
  );
};

export default ComputeDashboard;
