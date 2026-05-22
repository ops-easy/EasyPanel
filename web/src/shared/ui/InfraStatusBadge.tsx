import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";

type InfraStatusBadgeProps = {
  value?: string | boolean | null;
  okLabel?: string;
  badLabel?: string;
};

export default function InfraStatusBadge({
  value,
  okLabel = "正常",
  badLabel = "异常",
}: InfraStatusBadgeProps) {
  const raw = String(value ?? "").toLowerCase();
  const ok =
    value === true ||
    raw === "online" ||
    raw === "running" ||
    raw === "ok" ||
    raw === "success" ||
    raw === "available" ||
    raw === "up";

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-normal",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      )}
    >
      {typeof value === "boolean" ? (ok ? okLabel : badLabel) : value || badLabel}
    </Badge>
  );
}
