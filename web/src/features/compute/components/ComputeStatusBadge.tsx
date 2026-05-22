import React from "react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";
import { computeHealthLabels, type ComputeHealth } from "./compute-resource-types";

const healthTone: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  idle: "border-slate-200 bg-slate-100 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  unknown: "border-slate-200 bg-white text-slate-600",
};

function fallbackLabel(status?: string): string {
  if (!status) return "未知";
  const s = status.toLowerCase();
  if (s.includes("running") || s.includes("poweredon")) return "运行中";
  if (s.includes("online") || s.includes("connected")) return "在线";
  if (s.includes("stopped") || s.includes("poweredoff")) return "已停止";
  if (s.includes("failed") || s.includes("error")) return "异常";
  return status;
}

export type ComputeStatusBadgeProps = {
  status?: string;
  statusLabel?: string;
  health?: ComputeHealth;
  className?: string;
};

const ComputeStatusBadge: React.FC<ComputeStatusBadgeProps> = ({ status, statusLabel, health = "unknown", className }) => {
  const label = statusLabel || computeHealthLabels[health] || fallbackLabel(status);
  return (
    <Badge variant="outline" className={cn("font-normal", healthTone[health] ?? healthTone.unknown, className)}>
      {label}
    </Badge>
  );
};

export default ComputeStatusBadge;

