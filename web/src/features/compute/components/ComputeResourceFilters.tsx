import React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { cn } from "@/lib/utils";
import {
  computeHealthLabels,
  computeProviderLabels,
  type ComputeResourceFiltersState,
} from "./compute-resource-types";

export type ComputeResourceFiltersProps = {
  value: ComputeResourceFiltersState;
  providerOptions: string[];
  healthOptions: string[];
  statusOptions: string[];
  nodeOptions: string[];
  onChange: (next: ComputeResourceFiltersState) => void;
};

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-violet-200 bg-violet-50 text-violet-800"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function providerLabel(value: string) {
  return value === "all" ? "全部来源" : computeProviderLabels[value] ?? value;
}

const ComputeResourceFilters: React.FC<ComputeResourceFiltersProps> = ({
  value,
  providerOptions,
  healthOptions,
  statusOptions,
  nodeOptions,
  onChange,
}) => {
  const setField = (key: keyof ComputeResourceFiltersState, next: string) => onChange({ ...value, [key]: next });
  const reset = () => onChange({ query: "", provider: "all", health: "all", status: "all", node: "all" });

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            aria-label="搜索资源"
            value={value.query}
            onChange={(event) => setField("query", event.target.value)}
            placeholder="搜索名称、ID、节点、IP"
            className="h-9 border-slate-200 pl-9"
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={reset}>
          <X className="h-4 w-4" />
          重置
        </Button>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-medium text-slate-500">来源</span>
          {providerOptions.map((item) => (
            <FilterButton key={item} active={value.provider === item} onClick={() => setField("provider", item)}>
              {providerLabel(item)}
            </FilterButton>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-xs font-medium text-slate-500">健康状态</span>
          {healthOptions.map((item) => (
            <FilterButton key={item} active={value.health === item} onClick={() => setField("health", item)}>
              {computeHealthLabels[item] ?? item}
            </FilterButton>
          ))}
        </div>
        {statusOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs font-medium text-slate-500">原始状态</span>
            {statusOptions.map((item) => (
              <FilterButton key={item} active={value.status === item} onClick={() => setField("status", item)}>
                {item === "all" ? "全部" : item}
              </FilterButton>
            ))}
          </div>
        ) : null}
        {nodeOptions.length > 1 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-xs font-medium text-slate-500">节点</span>
            {nodeOptions.map((item) => (
              <FilterButton key={item} active={value.node === item} onClick={() => setField("node", item)}>
                {item === "all" ? "全部节点" : item}
              </FilterButton>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default ComputeResourceFilters;
