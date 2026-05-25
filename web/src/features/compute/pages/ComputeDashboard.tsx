import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Database,
  Gauge,
  ListChecks,
  Monitor,
  Server,
  Settings,
} from "lucide-react";
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
  statusLabel?: string;
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
    desc: "电源、节点、IP、规格与控制台操作。",
    to: "/cluster/compute/guests",
    icon: Monitor,
    tint: "border-violet-200 bg-violet-50 text-violet-800",
  },
  {
    key: "hosts",
    label: "宿主机 / 节点",
    desc: "ESXi 宿主机与 PVE 节点的健康和压力。",
    to: "/cluster/compute/hosts",
    icon: Server,
    tint: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "storage",
    label: "存储",
    desc: "datastore 与 PVE storage 的容量和归属。",
    to: "/cluster/compute/storage",
    icon: Database,
    tint: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    key: "activity",
    label: "任务活动",
    desc: "vCenter 事件与 PVE 任务的近期记录。",
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

function DashboardTile({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  description: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <Icon className={cn("h-4 w-4 shrink-0 text-slate-400", tone)} />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums text-slate-950", tone)}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function ActionLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50/50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-950">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-600" />
    </Link>
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
              <ComputeStatusBadge status={item.status} statusLabel={item.statusLabel} health={item.health} />
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
  const configuredProviderCount = providers.filter((provider) => provider.configured === true).length;
  const totalProviderCount = Math.max(providers.length, 2);
  const healthyCount = (health.ok ?? 0) + (health.idle ?? 0);
  const warningCount = summary?.warningCount ?? warnings.length;
  const dashboardMessage = !providerConfigured
    ? "还没有接入源，先完成 vCenter 或 PVE 配置。"
    : abnormalCount > 0
      ? "有异常资源需要优先处理，先从风险队列进入详情。"
      : warningCount > 0
        ? "接入源有提示信息，建议先检查配置与采集状态。"
        : "接入源和资源面整体稳定，可以进入对象视图处理日常操作。";

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-10">
      <ComputePageHeader
        eyebrow="Dashboard"
        title="虚拟化 Dashboard"
        description="面向日常运维的虚拟化态势页：只放接入源、风险队列、容量热点和下一步动作；虚拟机、宿主机、存储和任务活动进入对象视图处理。"
        refreshing={summaryQ.isFetching || providersQ.isFetching}
        onRefresh={() => {
          void providersQ.refetch();
          void summaryQ.refetch();
        }}
        action={
          <Button asChild className="h-9 gap-2 bg-violet-600 hover:bg-violet-700">
            <Link to={providerConfigured ? "/cluster/compute/guests" : "/cluster/compute/config"}>
              {providerConfigured ? "打开资源视图" : "打开配置"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">今日关注</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {providerConfigured ? (abnormalCount > 0 ? "先处理异常资源" : "资源面稳定") : "等待接入虚拟化资源"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{dashboardMessage}</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-white text-violet-700">
              <Gauge className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardTile
              icon={CheckCircle2}
              label="已接入源"
              value={`${configuredProviderCount}/${totalProviderCount}`}
              description="vCenter 与 PVE 的可用接入"
              tone={providerConfigured ? "text-emerald-700" : "text-slate-500"}
            />
            <DashboardTile
              icon={Monitor}
              label="资源对象"
              value={countText((counts.guests ?? 0) + (counts.hosts ?? 0) + (counts.storage ?? 0))}
              description="虚拟机、宿主机与存储总量"
            />
            <DashboardTile
              icon={AlertTriangle}
              label="异常资源"
              value={abnormalCount}
              description="warning 与 critical 聚合"
              tone={abnormalCount > 0 ? "text-rose-700" : "text-emerald-700"}
            />
            <DashboardTile
              icon={Activity}
              label="最近活动"
              value={countText(counts.activity)}
              description="任务、事件和变更记录"
            />
          </div>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold text-slate-950">下一步</h2>
          </div>
          <div className="space-y-2">
            {providerConfigured ? (
              <>
                <ActionLink
                  to={abnormalCount > 0 ? "/cluster/compute/guests" : "/cluster/compute/storage"}
                  title={abnormalCount > 0 ? "查看异常资源" : "检查容量热点"}
                  desc={abnormalCount > 0 ? "按健康状态过滤虚拟机、节点和存储。" : "查看 datastore 与 PVE storage 的可用空间。"}
                />
                <ActionLink
                  to="/cluster/compute/activity"
                  title="追踪最近活动"
                  desc="检查失败任务、vCenter 事件和 PVE 任务。"
                />
              </>
            ) : (
              <>
                <ActionLink to="/cluster/compute/config" title="配置接入源" desc="添加 vCenter 或 PVE 后再生成资源态势。" />
                <ActionLink to="/cluster/compute/config" title="补齐监控采集" desc="连接 Prometheus、iDRAC 或 VictoriaLogs。" />
              </>
            )}
          </div>
        </section>
      </section>

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
        <MiniMetric label="健康资源" value={healthyCount} tone="text-emerald-700" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SummaryList title="容量热点" empty="暂无需要关注的宿主机或存储压力。" items={summary?.hotspots ?? []} />
        <SummaryList title="最近活动" empty="暂无失败任务或异常事件。" items={summary?.recentFailures ?? []} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">资源入口</p>
            <h2 className="text-base font-semibold text-slate-950">进入对象视图</h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-slate-600">
            Dashboard 只保留判断和跳转，明细、筛选与操作集中在虚拟机、宿主机、存储和任务活动页面。
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {resourceCards.map(({ key, label, desc, to, icon: Icon, tint }) => (
            <Link
              key={key}
              to={to}
              className="group flex min-h-28 flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", tint)}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                  {countText(counts[key])}
                </span>
              </div>
              <div className="mt-3">
                <h3 className="text-sm font-semibold text-slate-950">{label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ComputeDashboard;
