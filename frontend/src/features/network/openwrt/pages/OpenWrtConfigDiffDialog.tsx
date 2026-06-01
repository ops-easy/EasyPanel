import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { apiPostJson } from "@/lib/api";
import type { NetworkDevice } from "./OpenWrtWorkspace";

type Preview = {
  commands?: string[];
  requiresConfirmation?: boolean;
};

export default function OpenWrtConfigDiffDialog({ target, canWrite }: { target?: NetworkDevice; canWrite: boolean }) {
  const [section, setSection] = useState("");
  const [value, setValue] = useState("");
  const [reload, setReload] = useState("network");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);

  const dryRun = useMutation({
    mutationFn: () =>
      apiPostJson<Preview>(`/api/network/devices/${encodeURIComponent(target?.id ?? "")}/openwrt/config/dry-run`, {
        changes: [{ section, value }],
        reload,
      }),
    onSuccess: (res) => {
      setPreview(res);
      setConfirm(false);
    },
  });

  const apply = useMutation({
    mutationFn: () =>
      apiPostJson(`/api/network/devices/${encodeURIComponent(target?.id ?? "")}/openwrt/config/apply`, {
        changes: [{ section, value }],
        reload,
        confirm,
      }),
    onSuccess: () => toast.success("OpenWrt 配置已应用"),
  });

  const disabled = !target || !canWrite;

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-3 flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-cyan-700" />
        <h3 className="text-sm font-semibold text-slate-950">配置变更</h3>
      </div>
      <div className="grid gap-2">
        <div className="grid gap-2">
          <Label>UCI 项</Label>
          <Input disabled={disabled} value={section} placeholder="network.lan.ipaddr" onChange={(e) => setSection(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>值</Label>
          <Input disabled={disabled} value={value} placeholder="192.168.1.1" onChange={(e) => setValue(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>Reload</Label>
          <Input disabled={disabled} value={reload} placeholder="network / wifi / dnsmasq / firewall" onChange={(e) => setReload(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={disabled || dryRun.isPending || !section.trim()} onClick={() => dryRun.mutate()}>
            {dryRun.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
            Dry-run
          </Button>
          <Button type="button" disabled={disabled || apply.isPending || !preview?.commands?.length || !confirm} onClick={() => apply.mutate()}>
            {apply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
            应用
          </Button>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600">
          <Checkbox checked={confirm} onCheckedChange={(value) => setConfirm(value === true)} disabled={disabled || !preview?.commands?.length} />
          我确认应用这些命令
        </label>
      </div>
      {preview?.commands?.length ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
          {preview.commands.join("\n")}
        </pre>
      ) : null}
    </div>
  );
}
