import type { ReactNode } from "react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";
import type { NetworkDeviceKind } from "@/features/network/components/networkDeviceSingleton";

export function ProviderBadge({ provider }: { provider: NetworkDeviceKind }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "w-fit shrink-0 font-normal",
        provider === "ikuai" ? "border-sky-200 bg-sky-50 text-sky-800" : "border-cyan-200 bg-cyan-50 text-cyan-800"
      )}
    >
      {provider === "ikuai" ? "iKuai" : "OpenWrt"}
    </Badge>
  );
}

export function TableCard({ children }: { children: ReactNode }) {
  return <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{children}</section>;
}

export function ViewToolbar({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
