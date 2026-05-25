import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CheckCircle2, Settings } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";
import { computeProviderLabels, type ComputeProvider } from "./compute-resource-types";

export type ComputeProviderHealthStripProps = {
  providers: ComputeProvider[];
  loading?: boolean;
  warnings?: string[];
};

const fallbackProviders: ComputeProvider[] = [
  { provider: "vcenter", name: "vCenter", configured: false },
  { provider: "pve", name: "PVE", configured: false },
];

const ComputeProviderHealthStrip: React.FC<ComputeProviderHealthStripProps> = ({ providers, loading, warnings = [] }) => {
  const rows = providers.length > 0 ? providers : fallbackProviders;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">正在读取接入源...</div>
          ) : (
            rows.map((provider) => {
              const configured = provider.configured === true;
              const label = provider.name || computeProviderLabels[provider.provider] || provider.provider;
              return (
                <div key={`${provider.provider}:${provider.targetId ?? ""}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">{label}</p>
                    <p className="truncate text-[11px] text-slate-500" title={provider.baseUrl || provider.hint || ""}>
                      {provider.baseUrl || provider.hint || "未填写接入信息"}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0 font-normal",
                      configured ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    {configured ? "已接入" : "未接入"}
                  </Badge>
                </div>
              );
            })
          )}
        </div>
        <Button asChild variant="outline" size="sm" className="h-9 gap-2">
          <Link to="/cluster/compute/config">
            <Settings className="h-4 w-4" />
            配置
          </Link>
        </Button>
      </div>
      {warnings.length > 0 ? (
        <div className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          {warnings.map((warning) => (
            <p key={warning} className="flex gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {warning}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          接入源状态会影响下方资源、容量热点和最近活动。
        </p>
      )}
    </section>
  );
};

export default ComputeProviderHealthStrip;
