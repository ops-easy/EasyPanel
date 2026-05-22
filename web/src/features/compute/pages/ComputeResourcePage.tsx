import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronRight,
  Database,
  Monitor,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type ComputeView = "guests" | "hosts" | "storage" | "activity";
type ProviderKey = "all" | "vcenter" | "pve";

type ComputeProvider = {
  provider: ProviderKey | string;
  targetId?: string;
  name?: string;
  configured?: boolean;
  healthy?: boolean;
  hint?: string;
  baseUrl?: string;
};

type ComputeRow = {
  provider: ProviderKey | string;
  targetId?: string;
  resourceId?: string | number;
  name?: string;
  status?: string;
  node?: string;
  ip?: string;
  guestType?: string;
  createdAt?: string;
  capabilities?: string[];
  source?: Record<string, unknown>;
};

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

const viewMeta: Record<
  ComputeView,
  {
    title: string;
    endpoint: string;
    dataKey: ComputeView;
    empty: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }
> = {
  guests: {
    title: "虚拟机 / CT",
    endpoint: "/api/compute/guests",
    dataKey: "guests",
    empty: "还没有发现虚拟机或容器资源。",
    icon: Monitor,
    description: "统一展示 vCenter VM 与 PVE QEMU / LXC，详情仍进入原平台的控制台、SSH、硬件和快照能力。",
  },
  hosts: {
    title: "宿主机 / 节点",
    endpoint: "/api/compute/hosts",
    dataKey: "hosts",
    empty: "还没有发现宿主机或节点资源。",
    icon: Server,
    description: "把 ESXi 宿主机和 PVE 节点放到同一视图，便于按资源对象接管日常运维。",
  },
  storage: {
    title: "存储",
    endpoint: "/api/compute/storage",
    dataKey: "storage",
    empty: "还没有发现 datastore 或 PVE 存储资源。",
    icon: Database,
    description: "统一查看 vCenter datastore 与 PVE storage 的容量、类型和可用状态。",
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

const providerLabels: Record<string, string> = {
  all: "全部来源",
  vcenter: "vCenter",
  pve: "PVE",
};

const capabilityLabels: Record<string, string> = {
  console: "控制台",
  detail: "详情",
  diskExpand: "扩容",
  guests: "Guest",
  hardware: "硬件",
  metrics: "监控",
  power: "电源",
  sftp: "SFTP",
  snapshots: "快照",
  ssh: "SSH",
  storage: "存储",
  tasks: "任务",
};

function valueText(value: unknown, fallback = "-"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "是" : "否";
  return fallback;
}

function sourceValue(row: ComputeRow, ...keys: string[]): unknown {
  const src = row.source ?? {};
  for (const key of keys) {
    const value = src[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatBytes(value: unknown): string {
  const n = numberValue(value);
  if (n == null || n <= 0) return "-";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let current = n;
  let idx = 0;
  while (current >= 1024 && idx < units.length - 1) {
    current /= 1024;
    idx += 1;
  }
  return `${current.toFixed(current >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatPct(value: unknown): string {
  const n = numberValue(value);
  if (n == null) return "-";
  const pct = n > 1 ? n : n * 100;
  return `${pct.toFixed(1)}%`;
}

function rowId(row: ComputeRow): string {
  return valueText(row.resourceId ?? sourceValue(row, "id", "upid", "moref", "vmid"), "-");
}

function providerLabel(row: ComputeRow): string {
  return providerLabels[row.provider] ?? valueText(row.provider, "未知来源");
}

function statusTone(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (["running", "ok", "online", "connected", "poweredon", "success"].some((v) => s.includes(v))) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["stopped", "offline", "poweredoff", "disabled"].some((v) => s.includes(v))) {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }
  if (["error", "failed", "notresponding"].some((v) => s.includes(v))) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function providerTone(provider: string): string {
  return provider === "vcenter"
    ? "border-violet-200 bg-violet-50 text-violet-800"
    : provider === "pve"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";
}

function guestSpec(row: ComputeRow): string {
  const cpu = valueText(sourceValue(row, "cpu", "maxcpu"), "-");
  const mem =
    row.provider === "vcenter"
      ? numberValue(sourceValue(row, "memoryMB"))
      : numberValue(sourceValue(row, "maxmem"));
  const memText = row.provider === "vcenter" && mem != null ? `${(mem / 1024).toFixed(1)} GiB` : formatBytes(mem);
  return cpu === "-" && memText === "-" ? "-" : `${cpu} CPU / ${memText}`;
}

function hostMetrics(row: ComputeRow): string {
  if (row.provider === "vcenter") {
    const cpu = formatPct(sourceValue(row, "cpuUsagePercent"));
    const mem = formatPct(sourceValue(row, "memoryUsagePercent"));
    return `CPU ${cpu} / 内存 ${mem}`;
  }
  const cpu = formatPct(sourceValue(row, "cpu"));
  const mem = formatBytes(sourceValue(row, "mem"));
  const maxMem = formatBytes(sourceValue(row, "maxmem"));
  return `CPU ${cpu} / 内存 ${mem}${maxMem !== "-" ? ` / ${maxMem}` : ""}`;
}

function storageMetrics(row: ComputeRow): string {
  if (row.provider === "vcenter") {
    const capacity = formatBytes(sourceValue(row, "capacityBytes"));
    const free = formatBytes(sourceValue(row, "freeBytes"));
    return `容量 ${capacity} / 可用 ${free}`;
  }
  const disk = formatBytes(sourceValue(row, "disk"));
  const maxDisk = formatBytes(sourceValue(row, "maxdisk"));
  return `已用 ${disk} / 总量 ${maxDisk}`;
}

function formatTime(value: unknown): string {
  const raw = valueText(value, "");
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

function detailPath(view: ComputeView, row: ComputeRow): string | null {
  const id = rowId(row);
  if (!id || id === "-") return null;
  if (view === "guests") {
    if (row.provider === "vcenter") return `/cluster/compute/vcenter/vms/${encodeURIComponent(id)}`;
    if (row.provider === "pve") {
      const node = valueText(row.node ?? sourceValue(row, "node"), "");
      const type = valueText(row.guestType ?? sourceValue(row, "type"), "qemu");
      const target = valueText(row.targetId, "");
      if (!node || !target) return null;
      return `/cluster/compute/pve/guests/${encodeURIComponent(target)}/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    }
  }
  if (view === "hosts") {
    if (row.provider === "vcenter") return `/cluster/compute/vcenter/hosts/${encodeURIComponent(id)}`;
    if (row.provider === "pve") {
      const target = valueText(row.targetId, "");
      if (!target) return null;
      return `/cluster/compute/pve/nodes/${encodeURIComponent(target)}/${encodeURIComponent(id)}`;
    }
  }
  return null;
}

function CapabilityList({ capabilities }: { capabilities?: string[] }) {
  const items = (capabilities ?? []).slice(0, 4);
  if (items.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {items.map((cap) => (
        <span key={cap} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {capabilityLabels[cap] ?? cap}
        </span>
      ))}
      {(capabilities?.length ?? 0) > items.length ? (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
          +{(capabilities?.length ?? 0) - items.length}
        </span>
      ) : null}
    </div>
  );
}

function RowAction({ view, row }: { view: ComputeView; row: ComputeRow }) {
  const to = detailPath(view, row);
  if (!to) return <span className="text-xs text-slate-400">-</span>;
  return (
    <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
      <Link to={to}>
        详情
        <ChevronRight className="h-3.5 w-3.5 opacity-70" />
      </Link>
    </Button>
  );
}

function SummaryChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

const ComputeResourcePage: React.FC<ComputeResourcePageProps> = ({ view }) => {
  const meta = viewMeta[view];
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderKey>("all");

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
  const warnings = rowsQ.data?.warnings ?? [];
  const configuredProviders = useMemo(
    () => (providersQ.data?.providers ?? []).filter((p) => p.configured),
    [providersQ.data?.providers]
  );
  const providerOptions = useMemo(() => {
    const seen = new Set<ProviderKey>();
    rows.forEach((row) => {
      if (row.provider === "vcenter" || row.provider === "pve") seen.add(row.provider);
    });
    configuredProviders.forEach((p) => {
      if (p.provider === "vcenter" || p.provider === "pve") seen.add(p.provider);
    });
    return ["all", ...Array.from(seen)] as ProviderKey[];
  }, [configuredProviders, rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (provider !== "all" && row.provider !== provider) return false;
      if (!q) return true;
      const text = [
        row.provider,
        row.targetId,
        row.resourceId,
        row.name,
        row.status,
        row.node,
        row.ip,
        row.guestType,
        sourceValue(row, "id", "moref", "vmid", "node", "storage", "type", "user", "upid"),
      ]
        .map((v) => valueText(v, ""))
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });
  }, [provider, query, rows]);

  const vcenterCount = rows.filter((row) => row.provider === "vcenter").length;
  const pveCount = rows.filter((row) => row.provider === "pve").length;
  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compute Resource</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Icon className="h-6 w-6 text-violet-600" />
              {meta.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{meta.description}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[360px]">
            <SummaryChip label="总数" value={rows.length} />
            <SummaryChip label="vCenter" value={vcenterCount} />
            <SummaryChip label="PVE" value={pveCount} />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {providerOptions.map((item) => {
            const active = provider === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setProvider(item)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-violet-200 bg-violet-50 text-violet-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {providerLabels[item] ?? item}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="搜索资源"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、ID、节点、IP"
              className="h-9 border-slate-200 pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2"
            onClick={() => void rowsQ.refetch()}
          >
            <RefreshCw className={cn("h-4 w-4", rowsQ.isFetching ? "animate-spin" : "")} />
            刷新
          </Button>
        </div>
      </section>

      {configuredProviders.length === 0 && !providersQ.isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">还没有接入 vCenter 或 PVE</p>
          <p className="mt-2 text-sm text-slate-500">请先在配置页添加接入源，资源对象导航会在接入后成为日常入口。</p>
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

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
              <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
              <TableHead className="min-w-[180px] font-semibold text-slate-800">名称</TableHead>
              <TableHead className="min-w-[140px] font-semibold text-slate-800">资源 ID</TableHead>
              <TableHead className="font-semibold text-slate-800">状态</TableHead>
              <TableHead className="min-w-[160px] font-semibold text-slate-800">
                {view === "activity" ? "时间 / 节点" : view === "storage" ? "容量" : view === "hosts" ? "资源" : "规格 / 位置"}
              </TableHead>
              <TableHead className="min-w-[180px] font-semibold text-slate-800">能力</TableHead>
              <TableHead className="w-[90px] text-right font-semibold text-slate-800">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  正在加载资源...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">
                  {query || provider !== "all" ? "没有匹配当前筛选条件的资源。" : meta.empty}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row, index) => (
                <TableRow key={`${row.provider}:${row.targetId ?? ""}:${rowId(row)}:${index}`} className="border-slate-100">
                  <TableCell>
                    <Badge variant="outline" className={cn("font-normal", providerTone(row.provider))}>
                      {providerLabel(row)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[260px]">
                    <p className="line-clamp-2 whitespace-normal break-words font-medium text-slate-900" title={row.name}>
                      {valueText(row.name, "-")}
                    </p>
                    {row.targetId ? <p className="mt-1 font-mono text-[11px] text-slate-400">{row.targetId}</p> : null}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-slate-600">{rowId(row)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("font-normal", statusTone(row.status))}>
                      {valueText(row.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {view === "guests" ? (
                      <div className="space-y-1">
                        <p>{guestSpec(row)}</p>
                        <p className="font-mono text-[11px] text-slate-500">
                          {valueText(row.node ?? sourceValue(row, "host", "node"), "-")}
                          {row.ip ? ` / ${row.ip}` : ""}
                        </p>
                      </div>
                    ) : view === "hosts" ? (
                      hostMetrics(row)
                    ) : view === "storage" ? (
                      <div className="space-y-1">
                        <p>{storageMetrics(row)}</p>
                        <p className="text-[11px] text-slate-500">
                          {valueText(sourceValue(row, "type", "content"), "")}
                          {row.node ? ` / ${row.node}` : ""}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p>{formatTime(row.createdAt ?? sourceValue(row, "starttime", "endtime"))}</p>
                        <p className="font-mono text-[11px] text-slate-500">{valueText(row.node ?? sourceValue(row, "node", "user"), "-")}</p>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <CapabilityList capabilities={row.capabilities} />
                  </TableCell>
                  <TableCell className="text-right">
                    <RowAction view={view} row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      {rowsQ.error ? (
        <p className="text-sm text-rose-600">{(rowsQ.error as Error).message}</p>
      ) : null}
    </div>
  );
};

export default ComputeResourcePage;
