import { useState } from "react";
import { Activity, Loader2, RefreshCw, RotateCcw, Wifi } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import type { NetworkDevice } from "./OpenWrtWorkspace";
import OpenWrtConfigDiffDialog from "./OpenWrtConfigDiffDialog";

type Props = {
  target?: NetworkDevice;
  canWrite: boolean;
  running: boolean;
  onAction: (action: string, confirm?: boolean) => void;
};

export default function OpenWrtActionPanel({ target, canWrite, running, onAction }: Props) {
  const [confirmName, setConfirmName] = useState("");
  const disabled = !target || !canWrite || running;
  const rebootConfirmed = confirmName.trim() === (target?.name ?? "").trim();

  return (
    <section className="rounded-lg min-w-0 overflow-hidden border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-700" />
        <h2 className="text-sm font-semibold text-slate-950">OpenWrt 操作</h2>
      </div>
      <div className="grid gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onAction("reload-network")}>
          {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          重载网络
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onAction("reload-wifi")}>
          <Wifi className="mr-2 h-4 w-4" />
          重载 Wi-Fi
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onAction("restart-dnsmasq")}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重启 dnsmasq
        </Button>
        <div className="grid gap-2 border-t border-slate-100 pt-3">
          <Input
            value={confirmName}
            disabled={!target || !canWrite}
            placeholder={target ? `输入 ${target.name} 确认重启` : "选择目标后可重启"}
            onChange={(e) => setConfirmName(e.target.value)}
          />
          <Button type="button" variant="destructive" disabled={disabled || !rebootConfirmed} onClick={() => onAction("reboot", true)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            重启设备
          </Button>
        </div>
      </div>
      <div className="mt-4">
        <OpenWrtConfigDiffDialog target={target} canWrite={canWrite} />
      </div>
    </section>
  );
}
