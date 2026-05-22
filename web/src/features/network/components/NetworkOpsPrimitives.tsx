import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { TableCell, TableRow } from "@/shared/ui/table";
import { cn } from "@/lib/utils";

export function networkText(value: unknown, fallback = "-"): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

export function formatDateTime(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("zh-CN", { hour12: false });
}

export function formatDurationSeconds(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  const day = Math.floor(seconds / 86400);
  const hour = Math.floor((seconds % 86400) / 3600);
  const minute = Math.floor((seconds % 3600) / 60);
  if (day > 0) return `${day}天 ${hour}时`;
  if (hour > 0) return `${hour}时 ${minute}分`;
  return `${minute}分`;
}

export function formatRate(value: unknown, unit: "kib" | "bytes" = "kib"): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "-";
  const kib = unit === "kib" ? n : n / 1024;
  if (kib >= 1024) return `${(kib / 1024).toFixed(2)} MiB/s`;
  if (kib >= 100) return `${kib.toFixed(0)} KiB/s`;
  return `${kib.toFixed(2)} KiB/s`;
}

export function NetworkMetricCard({
  label,
  value,
  hint,
  icon,
  tone = "slate",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "slate" | "cyan" | "emerald" | "amber" | "rose";
}) {
  const toneClass = {
    slate: "text-slate-700 bg-slate-50 border-slate-200",
    cyan: "text-cyan-700 bg-cyan-50 border-cyan-100",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
    rose: "text-rose-700 bg-rose-50 border-rose-100",
  }[tone];
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        {icon ? <span className={cn("flex h-7 w-7 items-center justify-center rounded-md border", toneClass)}>{icon}</span> : null}
      </div>
      <p className="mt-2 truncate text-xl font-semibold tabular-nums text-slate-950" title={String(value ?? "")}>
        {value}
      </p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-500" title={String(hint)}>{hint}</p> : null}
    </div>
  );
}

export function NetworkStatusBadge({
  ok,
  label,
  pendingLabel = "待确认",
}: {
  ok?: boolean;
  label?: string;
  pendingLabel?: string;
}) {
  if (ok === true) {
    return (
      <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {label ?? "正常"}
      </Badge>
    );
  }
  if (ok === false) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" />
        {label ?? "需处理"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-slate-600">
      <XCircle className="h-3.5 w-3.5" />
      {pendingLabel}
    </Badge>
  );
}

export function NetworkErrorList({ errors }: { errors?: string[] }) {
  const rows = errors?.filter(Boolean) ?? [];
  if (rows.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
      {rows.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

export function RawDataDisclosure({
  value,
  title = "原始数据",
  visible = false,
}: {
  value: unknown;
  title?: string;
  visible?: boolean;
}) {
  if (!visible) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-slate-50">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-slate-600">
        {title}
        <ChevronDown className="h-4 w-4" />
      </summary>
      <pre className="max-h-72 overflow-auto border-t border-slate-200 p-3 text-xs leading-5 text-slate-700">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}

export function LoadingTableRow({ colSpan, label = "加载中..." }: { colSpan: number; label?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          {label}
        </span>
      </TableCell>
    </TableRow>
  );
}

export function EmptyTableRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">
        {label}
      </TableCell>
    </TableRow>
  );
}
