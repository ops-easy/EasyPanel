import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/lib/utils";
import { NetworkErrorList, RawDataDisclosure } from "./NetworkOpsPrimitives";
import { NetworkProviderStrip } from "./NetworkProviderStrip";
import type { NetworkDevice, NetworkProviderSummary, ProviderKey } from "@/features/network/model/networkTypes";

const providerLabels: Record<ProviderKey, string> = {
  all: "全部来源",
  ikuai: "iKuai",
  openwrt: "OpenWrt",
};

export function NetworkResourceShell({
  eyebrow = "Network Resource",
  title,
  description,
  icon,
  summary,
  providers,
  devices,
  provider,
  onProviderChange,
  query,
  onQueryChange,
  action,
  loading,
  backgroundLoading,
  errors,
  onRefresh,
  rawVisible,
  rawValue,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  icon: ReactNode;
  summary: Array<{ label: string; value: ReactNode }>;
  providers: NetworkProviderSummary[];
  devices: NetworkDevice[];
  provider: ProviderKey;
  onProviderChange: (provider: ProviderKey) => void;
  query: string;
  onQueryChange: (query: string) => void;
  action?: ReactNode;
  loading?: boolean;
  backgroundLoading?: boolean;
  errors?: string[];
  onRefresh: () => void;
  rawVisible?: boolean;
  rawValue?: unknown;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] min-w-0 space-y-5 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">{eyebrow}</p>
            <h1 className="mt-1 flex min-w-0 items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <span className="shrink-0 text-cyan-700">{icon}</span>
              <span className="truncate">{title}</span>
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-left sm:min-w-[360px] sm:grid-cols-3 sm:text-right">
            {summary.map((item) => (
              <div key={item.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <NetworkProviderStrip providers={providers} devices={devices} />

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "ikuai", "openwrt"] as ProviderKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onProviderChange(item)}
              className={cn(
                "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors",
                provider === item
                  ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {providerLabels[item]}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:min-w-[280px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="搜索网络资源"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索名称、IP、MAC、接口"
              className="h-9 border-slate-200 pl-9"
            />
          </div>
          {action}
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={onRefresh}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
      </section>

      {devices.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">还没有接入网络来源</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">先在配置页保存 iKuai 或 OpenWrt，资源视图会自动启用。</p>
          <Button asChild className="mt-4 bg-cyan-700 hover:bg-cyan-800">
            <Link to="/cluster/network/access">
              打开配置
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </section>
      ) : null}

      <NetworkErrorList errors={errors} />

      {backgroundLoading ? (
        <div className="flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-900">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <p>正在更新数据，已先展示可用结果。</p>
        </div>
      ) : null}

      {children}

      <RawDataDisclosure visible={rawVisible} title="原始数据" value={rawValue} />
    </div>
  );
}
