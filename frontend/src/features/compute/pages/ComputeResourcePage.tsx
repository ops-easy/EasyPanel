import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, Monitor, Server } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { apiGetJson } from "@/lib/api";
import ComputePageHeader from "@/features/compute/components/ComputePageHeader";
import ComputeResourceFilters from "@/features/compute/components/ComputeResourceFilters";
import ComputeResourceTable from "@/features/compute/components/ComputeResourceTable";
import ComputeStatusBadge from "@/features/compute/components/ComputeStatusBadge";
import {
  type ComputeProvider,
  type ComputeResourceFiltersState,
  type ComputeRow,
  type ComputeView,
  type ComputeViewMeta,
} from "@/features/compute/components/compute-resource-types";

type ComputeListResponse = {
  guests?: ComputeRow[];
  hosts?: ComputeRow[];
  storage?: ComputeRow[];
  activity?: ComputeRow[];
  warnings?: string[];
};

type ComputeProvidersResponse = {
  providers?: ComputeProvider[];
  warnings?: string[];
};

export type ComputeResourcePageProps = {
  view: ComputeView;
};

const viewMeta: Record<ComputeView, ComputeViewMeta> = {
  guests: {
    title: "虚拟机 / CT",
    endpoint: "/api/compute/guests",
    dataKey: "guests",
    empty: "还没有发现虚拟机或容器资源。",
    icon: Monitor,
    description: "统一展示 vCenter VM 与 PVE QEMU / LXC，列表只保留进入控制台、SSH 和详情的导航，电源等危险操作在详情页确认。",
  },
  hosts: {
    title: "宿主机 / 节点",
    endpoint: "/api/compute/hosts",
    dataKey: "hosts",
    empty: "还没有发现宿主机或节点资源。",
    icon: Server,
    description: "把 ESXi 宿主机和 PVE 节点放到同一视图，优先查看健康、资源压力和关联能力。",
  },
  storage: {
    title: "存储",
    endpoint: "/api/compute/storage",
    dataKey: "storage",
    empty: "还没有发现 datastore 或 PVE 存储资源。",
    icon: Database,
    description: "统一查看 vCenter datastore 与 PVE storage 的容量、类型、节点归属和可用状态。",
  },
  activity: {
    title: "任务活动",
    endpoint: "/api/compute/activity",
    dataKey: "activity",
    empty: "暂时没有任务或事件活动。",
    icon: Activity,
    description: "汇总 vCenter 事件缓存与 PVE 任务，优先服务操作审计和日常追踪。",
  },
};

const defaultFilters: ComputeResourceFiltersState = {
  query: "",
  provider: "all",
  health: "all",
  status: "all",
  node: "all",
};

function valueText(value: unknown, fallback = ""): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function sourceValue(row: ComputeRow, ...keys: string[]): unknown {
  const src = row.source ?? {};
  for (const key of keys) {
    const value = src[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function uniqueOptions(values: string[]): string[] {
  return ["all", ...Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"))];
}

const ComputeResourcePage: React.FC<ComputeResourcePageProps> = ({ view }) => {
  const meta = viewMeta[view];
  const [filters, setFilters] = useState<ComputeResourceFiltersState>(defaultFilters);

  const providersQ = useQuery({
    queryKey: ["compute-providers"],
    queryFn: ({ signal }) => apiGetJson<ComputeProvidersResponse>("/api/compute/providers", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rowsQ = useQuery({
    queryKey: ["compute-resource", view],
    queryFn: ({ signal }) => apiGetJson<ComputeListResponse>(meta.endpoint, { signal }),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => rowsQ.data?.[meta.dataKey] ?? [], [meta.dataKey, rowsQ.data]);
  const configuredProviders = useMemo(
    () => (providersQ.data?.providers ?? []).filter((provider) => provider.configured),
    [providersQ.data?.providers]
  );

  const providerOptions = useMemo(() => {
    const values = rows.map((row) => String(row.provider || "")).filter(Boolean);
    configuredProviders.forEach((provider) => values.push(String(provider.provider)));
    return uniqueOptions(values);
  }, [configuredProviders, rows]);

  const healthOptions = useMemo(() => uniqueOptions(rows.map((row) => String(row.health || "unknown"))), [rows]);
  const statusOptions = useMemo(() => uniqueOptions(rows.map((row) => String(row.statusLabel || row.status || ""))), [rows]);
  const nodeOptions = useMemo(
    () => uniqueOptions(rows.map((row) => valueText(row.node ?? sourceValue(row, "host", "node")))),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filters.provider !== "all" && row.provider !== filters.provider) return false;
      if (filters.health !== "all" && row.health !== filters.health) return false;
      const rowStatus = valueText(row.statusLabel || row.status);
      if (filters.status !== "all" && rowStatus !== filters.status) return false;
      const rowNode = valueText(row.node ?? sourceValue(row, "host", "node"));
      if (filters.node !== "all" && rowNode !== filters.node) return false;
      if (!q) return true;
      const text = [
        row.provider,
        row.targetId,
        row.resourceId,
        row.name,
        row.status,
        row.statusLabel,
        row.health,
        row.node,
        row.ip,
        row.guestType,
        sourceValue(row, "id", "moref", "vmid", "node", "storage", "type", "user", "upid"),
      ]
        .map((item) => valueText(item))
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [filters, rows]);

  const warnings = [...(providersQ.data?.warnings ?? []), ...(rowsQ.data?.warnings ?? [])];
  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-10">
      <ComputePageHeader
        eyebrow="Compute Resource"
        title={meta.title}
        description={meta.description}
        icon={Icon}
        refreshing={rowsQ.isFetching}
        onRefresh={() => void rowsQ.refetch()}
      />

      <section className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">总数</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">筛选后</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{filteredRows.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">异常</p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-rose-700">{rows.filter((row) => row.health === "critical").length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
          <p className="text-[11px] text-slate-500">状态概览</p>
          <div className="mt-1"><ComputeStatusBadge health="ok" statusLabel="正常" /></div>
        </div>
      </section>

      <ComputeResourceFilters
        value={filters}
        providerOptions={providerOptions}
        healthOptions={healthOptions}
        statusOptions={statusOptions}
        nodeOptions={nodeOptions}
        onChange={setFilters}
      />

      {configuredProviders.length === 0 && !providersQ.isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">还没有配置 vCenter 或 PVE</p>
          <p className="mt-2 text-sm text-slate-500">请先在配置页添加资源源，资源对象导航会在配置后成为日常入口。</p>
          <Button asChild className="mt-4 bg-violet-600 hover:bg-violet-700">
            <Link to="/cluster/compute/config">打开配置</Link>
          </Button>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <ComputeResourceTable
        view={view}
        rows={filteredRows}
        loading={rowsQ.isLoading}
        emptyLabel={filters.query || filters.provider !== "all" || filters.health !== "all" || filters.status !== "all" || filters.node !== "all" ? "没有匹配当前筛选条件的资源。" : meta.empty}
      />
    </div>
  );
};

export default ComputeResourcePage;
