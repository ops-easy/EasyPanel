import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Monitor, Power, SquareTerminal } from "lucide-react";
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

const ComputeRowActions: React.FC<{ view: ComputeView; row: ComputeRow }> = ({ view, row }) => {
  const detailTo = computeDetailPath(view, row);
  const showConsole = view === "guests" && hasAction(row, "console") && detailTo;
  const showSsh = view === "guests" && hasAction(row, "ssh") && detailTo;
  const showPower = view === "guests" && hasAction(row, "power");

  return (
    <div className="flex justify-end gap-1">
      {showConsole ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
          <Link to={detailTo}>
            <Monitor className="h-3.5 w-3.5" />
            控制台
          </Link>
        </Button>
      ) : null}
      {showSsh ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
          <Link to={detailTo}>
            <SquareTerminal className="h-3.5 w-3.5" />
            SSH
          </Link>
        </Button>
      ) : null}
      {showPower ? (
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled title="电源操作在详情页确认后执行">
          <Power className="h-3.5 w-3.5" />
          电源
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

