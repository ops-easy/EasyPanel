import React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";

export type ComputePageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  refreshing?: boolean;
  action?: React.ReactNode;
  onRefresh?: () => void;
};

const ComputePageHeader: React.FC<ComputePageHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon: Icon,
  refreshing,
  action,
  onRefresh,
}) => (
  <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{eyebrow}</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
          {Icon ? <Icon className="h-6 w-6 text-violet-600" /> : null}
          {title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {onRefresh ? (
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing ? "animate-spin" : "")} />
            刷新
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  </section>
);

export default ComputePageHeader;

