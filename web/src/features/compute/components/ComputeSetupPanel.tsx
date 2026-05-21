import React, { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, PlugZap, ServerCog } from "lucide-react";
import { Button } from "@/shared/ui/button";

type ComputeSetupKind = "vcenter" | "pve";

type ComputeSetupPanelProps = {
  kind: ComputeSetupKind;
  title: string;
  description: string;
  primaryLabel?: string;
  primaryTo?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  children?: ReactNode;
  compact?: boolean;
};

const tone: Record<ComputeSetupKind, { eyebrow: string; accent: string; icon: typeof ServerCog }> = {
  vcenter: { eyebrow: "vCenter", accent: "text-violet-700", icon: ServerCog },
  pve: { eyebrow: "Proxmox VE", accent: "text-amber-700", icon: PlugZap },
};

const ComputeSetupPanel: React.FC<ComputeSetupPanelProps> = ({
  kind,
  title,
  description,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  children,
  compact = false,
}) => {
  const meta = tone[kind];
  const Icon = meta.icon;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wide ${meta.accent}`}>
            {meta.eyebrow}
          </p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Icon className={`h-5 w-5 ${meta.accent}`} />
            {title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {(primaryTo && primaryLabel) || (secondaryTo && secondaryLabel) ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {secondaryTo && secondaryLabel ? (
              <Button variant="outline" asChild>
                <Link to={secondaryTo}>{secondaryLabel}</Link>
              </Button>
            ) : null}
            {primaryTo && primaryLabel ? (
              <Button asChild>
                <Link to={primaryTo}>
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      {!compact && children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
};

export default ComputeSetupPanel;
