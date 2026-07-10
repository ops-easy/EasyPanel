import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Monitor, SquareTerminal } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { ComputeRow, ComputeView } from "./compute-resource-types";

function valueText(value: unknown, fallback = ""): string {
  if (value == null || value === "") return fallback;
  return String(value);
}

function sourceValue(row: ComputeRow, ...keys: string[]): unknown {
  const src = row.source ?? {};
  for (const key of keys) {
    const value = src[key];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function rowId(row: ComputeRow): string {
  return valueText(row.resourceId ?? sourceValue(row, "id", "upid", "moref", "vmid"), "");
}

export function computeDetailPath(view: ComputeView, row: ComputeRow): string | null {
  const id = rowId(row);
  if (!id) return null;
  if (view === "guests") {
    if (row.provider === "vcenter") return `/cluster/compute/vcenter/vms/${encodeURIComponent(id)}`;
    if (row.provider === "pve") {
      const node = valueText(row.node ?? sourceValue(row, "node"), "");
      const type = valueText(row.guestType ?? sourceValue(row, "type"), "qemu");
      const target = valueText(row.targetId, "");
      if (!node || !target) return null;
      return `/cluster/compute/pve/guests/${encodeURIComponent(target)}/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
    }
  }
  if (view === "hosts") {
    if (row.provider === "vcenter") return `/cluster/compute/vcenter/hosts/${encodeURIComponent(id)}`;
    if (row.provider === "pve") {
      const target = valueText(row.targetId, "");
      if (!target) return null;
      return `/cluster/compute/pve/nodes/${encodeURIComponent(target)}/${encodeURIComponent(id)}`;
    }
  }
  return null;
}

function hasAction(row: ComputeRow, action: string): boolean {
  return (row.actions ?? row.capabilities ?? []).includes(action);
}

function withDetailTab(path: string | null, tab: "console" | "ssh"): string | null {
  if (!path) return null;
  const separator = path.includes("?") ? "&" : "?";
  const query = tab === "console" ? "tab=console" : "tab=ssh";
  return `${path}${separator}${query}`;
}

const ComputeRowActions: React.FC<{
  view: ComputeView;
  row: ComputeRow;
}> = ({ view, row }) => {
  const detailTo = computeDetailPath(view, row);
  const consoleTo = view === "guests" && hasAction(row, "console") ? withDetailTab(detailTo, "console") : null;
  const sshTo = view === "guests" && hasAction(row, "ssh") ? withDetailTab(detailTo, "ssh") : null;

  return (
    <div className="flex justify-end gap-1">
      {consoleTo ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
          <Link to={consoleTo}>
            <Monitor className="h-3.5 w-3.5" />
            控制台
          </Link>
        </Button>
      ) : null}
      {sshTo ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
          <Link to={sshTo}>
            <SquareTerminal className="h-3.5 w-3.5" />
            SSH
          </Link>
        </Button>
      ) : null}
      {detailTo ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
          <Link to={detailTo}>
            详情
            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
          </Link>
        </Button>
      ) : (
        <span className="px-2 text-xs text-slate-400">-</span>
      )}
    </div>
  );
};

export default ComputeRowActions;
