import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleIcon, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccessHealthStatus = "ok" | "warn" | "missing" | "unknown";

export type AccessHealthItem = {
  label: string;
  status: AccessHealthStatus;
  detail: string;
  scope?: string;
  to?: string;
};

const statusMeta: Record<AccessHealthStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "已配置", className: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
  warn: { label: "需确认", className: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  missing: { label: "未配置", className: "border-rose-200 bg-rose-50 text-rose-800", icon: XCircle },
  unknown: { label: "待检测", className: "border-slate-200 bg-slate-50 text-slate-700", icon: CircleIcon },
};

export function AccessHealthMatrix({ items }: { items: AccessHealthItem[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">接入健康矩阵</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            先看数据源是否可用，再决定进入监控、告警、日志或巡检报告排障。
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const meta = statusMeta[item.status];
          const Icon = meta.icon;
          const body = (
            <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.label}</p>
                  {item.scope ? <p className="mt-0.5 font-mono text-[11px] text-slate-500">{item.scope}</p> : null}
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", meta.className)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                </span>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-600">{item.detail}</p>
            </div>
          );
          return item.to ? (
            <Link key={`${item.label}-${item.scope ?? ""}`} to={item.to} className="block">
              {body}
            </Link>
          ) : (
            <div key={`${item.label}-${item.scope ?? ""}`}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
