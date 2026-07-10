import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Badge } from "@/shared/ui/badge";
import { computeProviderLabels, type ComputeRow, type ComputeView } from "./compute-resource-types";
import ComputeRowActions from "./ComputeRowActions";
import ComputeStatusBadge from "./ComputeStatusBadge";
import { cn } from "@/lib/utils";

const guestColumns = ["来源", "名称", "状态", "节点 / IP", "规格", "能力", "操作"];
const hostColumns = ["来源", "名称", "健康", "资源", "关联能力", "操作"];
const storageColumns = ["来源", "名称", "状态", "容量", "类型 / 节点", "操作"];
const activityColumns = ["来源", "事件 / 任务", "结果", "时间", "节点 / 操作者", "操作"];

function valueText(value: unknown, fallback = "-"): string {
  if (value == null || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "是" : "否";
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

function formatCpuCores(value: unknown): string {
  const n = numberValue(value);
  if (n == null || n <= 0) return "-";
  return `${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)} 核`;
}

function formatTime(value: unknown): string {
  const raw = valueText(value, "");
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function providerTone(provider: string): string {
  return provider === "vcenter"
    ? "border-violet-200 bg-violet-50 text-violet-800"
    : provider === "pve"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-700";
}

function ProviderBadge({ provider }: { provider: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", providerTone(provider))}>
      {computeProviderLabels[provider] ?? provider}
    </Badge>
  );
}

function CapabilityList({ row }: { row: ComputeRow }) {
  const items = (row.actions ?? row.capabilities ?? []).slice(0, 4);
  if (items.length === 0) return <span className="text-slate-400">-</span>;
  return (
    <div className="flex max-w-[260px] flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {capabilityLabel(item)}
        </span>
      ))}
      {(row.actions ?? row.capabilities ?? []).length > items.length ? (
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
          +{(row.actions ?? row.capabilities ?? []).length - items.length}
        </span>
      ) : null}
    </div>
  );
}

function capabilityLabel(item: string): string {
  const labels: Record<string, string> = {
    detail: "详情",
    metrics: "性能",
    power: "电源",
    hardware: "硬件",
    console: "控制台",
    ssh: "SSH",
    sftp: "SFTP",
    snapshots: "快照",
    storage: "存储",
    tasks: "任务",
  };
  return labels[item] ?? item;
}

function guestSpec(row: ComputeRow): string {
  const cpuSource = row.provider === "pve"
    ? sourceValue(row, "maxcpu", "cores", "cpus", "vcpus")
    : sourceValue(row, "numCpu", "cpu", "cores", "maxcpu");
  const cpu = formatCpuCores(cpuSource);
  const mem = row.provider === "vcenter" ? numberValue(sourceValue(row, "memoryMB")) : numberValue(sourceValue(row, "maxmem"));
  const memText = row.provider === "vcenter" && mem != null ? `${(mem / 1024).toFixed(1)} GiB` : formatBytes(mem);
  if (cpu === "-" && memText === "-") return "-";
  if (cpu === "-") return memText;
  if (memText === "-") return cpu;
  return `${cpu} / ${memText}`;
}

function hostMetrics(row: ComputeRow): string {
  const cpu = row.usage?.cpuPct ?? sourceValue(row, "cpuUsagePercent", "cpu");
  const memPct = row.usage?.memoryPct ?? sourceValue(row, "memoryUsagePercent");
  if (memPct != null) return `CPU ${formatPct(cpu)} / 内存 ${formatPct(memPct)}`;
  return `CPU ${formatPct(cpu)} / 内存 ${formatBytes(sourceValue(row, "mem"))} / ${formatBytes(sourceValue(row, "maxmem"))}`;
}

function storageMetrics(row: ComputeRow): string {
  if (row.usage?.diskPct != null) {
    return `使用率 ${formatPct(row.usage.diskPct)} / ${formatBytes(row.usage.diskUsedBytes)} / ${formatBytes(row.usage.diskTotalBytes)}`;
  }
  if (row.provider === "vcenter") return `容量 ${formatBytes(sourceValue(row, "capacityBytes"))} / 可用 ${formatBytes(sourceValue(row, "freeBytes"))}`;
  return `已用 ${formatBytes(sourceValue(row, "disk"))} / 总量 ${formatBytes(sourceValue(row, "maxdisk"))}`;
}

function columnLabels(view: ComputeView): string[] {
  if (view === "guests") return guestColumns;
  if (view === "hosts") return hostColumns;
  if (view === "storage") return storageColumns;
  return activityColumns;
}

export type ComputeResourceTableProps = {
  view: ComputeView;
  rows: ComputeRow[];
  loading: boolean;
  emptyLabel: string;
};

const ComputeResourceTable: React.FC<ComputeResourceTableProps> = ({ view, rows, loading, emptyLabel }) => {
  const columns = columnLabels(view);
  return (
    <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
            {columns.map((column, index) => (
              <TableHead key={column} className={cn("font-semibold text-slate-800", index === columns.length - 1 ? "text-right" : "")}>
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-slate-500">
                正在加载资源...
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-slate-500">
                {emptyLabel}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, index) => (
              <TableRow key={`${row.provider}:${row.targetId ?? ""}:${row.resourceId ?? row.name ?? index}`} className="border-slate-100">
                <TableCell>
                  <ProviderBadge provider={String(row.provider)} />
                </TableCell>
                {view === "guests" ? (
                  <>
                    <TableCell className="max-w-[260px]">
                      <p className="line-clamp-2 whitespace-normal break-words font-medium text-slate-900" title={row.name}>
                        {valueText(row.name)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{valueText(row.resourceId)}</p>
                    </TableCell>
                    <TableCell><ComputeStatusBadge status={row.status} statusLabel={row.statusLabel} health={row.health} /></TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <p className="font-mono">{valueText(row.node ?? sourceValue(row, "host", "node"))}</p>
                      <p className="font-mono text-[11px] text-slate-500">{valueText(row.ip)}</p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">{guestSpec(row)}</TableCell>
                    <TableCell><CapabilityList row={row} /></TableCell>
                  </>
                ) : view === "hosts" ? (
                  <>
                    <TableCell className="max-w-[260px]">
                      <p className="font-medium text-slate-900">{valueText(row.name)}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{valueText(row.resourceId)}</p>
                    </TableCell>
                    <TableCell><ComputeStatusBadge status={row.status} statusLabel={row.statusLabel} health={row.health} /></TableCell>
                    <TableCell className="text-xs text-slate-600">{hostMetrics(row)}</TableCell>
                    <TableCell><CapabilityList row={row} /></TableCell>
                  </>
                ) : view === "storage" ? (
                  <>
                    <TableCell className="max-w-[260px]">
                      <p className="font-medium text-slate-900">{valueText(row.name)}</p>
                      <p className="mt-1 font-mono text-[11px] text-slate-400">{valueText(row.resourceId)}</p>
                    </TableCell>
                    <TableCell><ComputeStatusBadge status={row.status} statusLabel={row.statusLabel} health={row.health} /></TableCell>
                    <TableCell className="text-xs text-slate-600">{storageMetrics(row)}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {valueText(sourceValue(row, "type", "content"))}
                      {row.node ? ` / ${row.node}` : ""}
                    </TableCell>
                  </>
                ) : (
                  <>
                    <TableCell className="max-w-[320px]">
                      <p className="line-clamp-2 font-medium text-slate-900">{valueText(row.name)}</p>
                      <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{valueText(row.resourceId)}</p>
                    </TableCell>
                    <TableCell><ComputeStatusBadge status={row.status} statusLabel={row.statusLabel} health={row.health} /></TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{formatTime(row.createdAt ?? sourceValue(row, "starttime", "endtime"))}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{valueText(row.node ?? sourceValue(row, "node", "user"))}</TableCell>
                  </>
                )}
                <TableCell className="text-right">
                  <ComputeRowActions view={view} row={row} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
};

export default ComputeResourceTable;
