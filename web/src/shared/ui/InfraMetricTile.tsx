import type React from "react";
import { cn } from "@/lib/utils";

type InfraMetricTileProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "cyan";
};

const toneClass = {
  slate: "border-slate-200 bg-white text-slate-950",
  green: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
  amber: "border-amber-200 bg-amber-50/70 text-amber-950",
  red: "border-red-200 bg-red-50/70 text-red-950",
  cyan: "border-cyan-200 bg-cyan-50/70 text-cyan-950",
};

export default function InfraMetricTile({
  label,
  value,
  hint,
  tone = "slate",
}: InfraMetricTileProps) {
  return (
    <div className={cn("rounded-lg border p-3 shadow-sm", toneClass[tone])}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
