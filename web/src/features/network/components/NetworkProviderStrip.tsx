import { Router, Wifi } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";
import { buildNetworkProviderCapability, capabilityOkCount } from "@/features/network/model/networkCapabilities";
import { formatDateTime } from "./NetworkOpsPrimitives";
import type { NetworkDevice, NetworkProviderSummary } from "@/features/network/model/networkTypes";

const providerIcon = {
  ikuai: Router,
  openwrt: Wifi,
};

export function NetworkProviderStrip({
  providers,
  devices,
}: {
  providers: NetworkProviderSummary[];
  devices: NetworkDevice[];
}) {
  return (
    <section className="grid min-w-0 gap-3 md:grid-cols-2">
      {providers.map((provider) => {
        const device = devices.find((item) => item.kind === provider.provider);
        const capability = provider.capability ?? buildNetworkProviderCapability(provider.provider, device);
        const Icon = providerIcon[provider.provider];
        const total = capability.management.length + capability.monitoring.length;
        const ready = capabilityOkCount(capability);
        return (
          <div key={provider.provider} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                    provider.provider === "ikuai" ? "border-sky-100 bg-sky-50 text-sky-700" : "border-cyan-100 bg-cyan-50 text-cyan-700"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">{provider.label}</p>
                  <p className="mt-1 truncate text-xs text-slate-500" title={provider.address}>
                    {provider.address}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0 font-normal",
                  provider.configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"
                )}
              >
                {provider.configured ? "已接入" : "未接入"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">能力覆盖</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {ready}/{total || 1}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] text-slate-500">最近更新</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950">
                  {provider.updatedAt ? formatDateTime(provider.updatedAt) : "尚未保存"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}
