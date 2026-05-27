import type { ReactNode } from "react";
import { Bell, ClipboardList, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function CurrentRiskPanel({
  rating,
  updatedAt,
  bellActive,
  reportCount,
  enabledAlertRules,
  children,
}: {
  rating?: string;
  updatedAt?: string;
  bellActive?: boolean;
  reportCount?: number;
  enabledAlertRules?: number;
  children: ReactNode;
}) {
  const normalizedRating = rating?.trim() || "pending";
  const critical = bellActive || normalizedRating.toLowerCase() === "critical";

  return (
    <section className={cn("rounded-2xl border p-5 shadow-sm", critical ? "border-rose-200 bg-rose-50/50" : "border-slate-200 bg-white")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            {critical ? <Bell className="h-5 w-5 text-rose-600" aria-hidden /> : <Sparkles className="h-5 w-5 text-cyan-600" aria-hidden />}
            当前风险
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            这里集中展示控制平面周期建议、告警规则数量和最新巡检报告状态。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold uppercase text-slate-700">
            评级 {normalizedRating}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            告警 {enabledAlertRules ?? 0}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            报告 {reportCount ?? 0}
          </span>
        </div>
      </div>
      {updatedAt ? <p className="mt-2 font-mono text-[11px] text-slate-500">最近更新 {updatedAt}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
