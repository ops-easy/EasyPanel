import { cn } from "@/lib/utils";

type InfraUsageBarProps = {
  value: number | null | undefined;
  label?: string;
};

export default function InfraUsageBar({ value, label }: InfraUsageBarProps) {
  const pct = value == null || !Number.isFinite(value) ? null : Math.max(0, Math.min(100, value));
  const tone = pct == null ? "bg-slate-200" : pct >= 85 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="min-w-[110px] space-y-1">
      <div className="h-2 rounded-full bg-slate-100">
        <div className={cn("h-2 rounded-full transition-[width]", tone)} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <p className="whitespace-nowrap text-[11px] text-slate-500">{label ?? (pct == null ? "-" : `${pct.toFixed(1)}%`)}</p>
    </div>
  );
}
