import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import type { HermesInstance, HermesStatus } from "./AppCenterHermesDetail";
import { apiPutJson } from "@/lib/api";
import { withAppCenterMutationConfirmQuery } from "@/features/app-center/lib/appCenterMutationConfirm";

export default function HermesExposurePanel({
  instance,
  status,
  canWrite,
  onChanged,
}: {
  instance?: HermesInstance;
  status?: HermesStatus;
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [exposeMode, setExposeMode] = useState("clusterIP");
  const [ingressHost, setIngressHost] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [nodePort, setNodePort] = useState("");

  useEffect(() => {
    setExposeMode(instance?.exposeMode || "clusterIP");
    setIngressHost(instance?.ingressHost || "");
    setPublicUrl(instance?.publicUrl || "");
    setNodePort(instance?.nodePort ? String(instance.nodePort) : "");
  }, [instance]);

  const save = useMutation({
    mutationFn: () =>
      apiPutJson(
        withAppCenterMutationConfirmQuery(`/api/app-center/hermes/instances/${encodeURIComponent(instance?.id ?? "")}/exposure`),
        {
          exposeMode,
          ingressHost,
          publicUrl,
          nodePort: Number(nodePort) || 0,
        }
      ),
    onSuccess: () => {
      toast.success("Hermes 暴露配置已更新");
      onChanged();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Network className="h-4 w-4 text-fuchsia-700" />
        <h2 className="text-sm font-semibold text-slate-950">访问暴露</h2>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>Expose mode</Label>
          <div className="grid grid-cols-2 gap-2">
            {["clusterIP", "nodePort", "loadBalancer", "ingress"].map((mode) => (
              <Button key={mode} type="button" variant={exposeMode === mode ? "default" : "outline"} size="sm" disabled={!canWrite} onClick={() => setExposeMode(mode)}>
                {mode}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>NodePort</Label>
            <Input value={nodePort} disabled={!canWrite || exposeMode !== "nodePort"} onChange={(e) => setNodePort(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>Ingress host</Label>
            <Input value={ingressHost} disabled={!canWrite || exposeMode !== "ingress"} onChange={(e) => setIngressHost(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Public URL</Label>
          <Input value={publicUrl} disabled={!canWrite} onChange={(e) => setPublicUrl(e.target.value)} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        当前 Service：{status?.serviceType || "-"}，端口 {(status?.ports ?? []).map((p) => `${p.name}:${p.port}${p.nodePort ? `/${p.nodePort}` : ""}`).join(" / ") || "-"}
      </p>
      <Button className="mt-4" disabled={!instance || !canWrite || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Network className="mr-2 h-4 w-4" />}
        保存暴露配置
      </Button>
    </section>
  );
}
