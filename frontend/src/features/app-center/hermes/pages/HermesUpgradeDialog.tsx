import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RotateCcw, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { apiPostJson } from "@/lib/api";
import { withAppCenterMutationConfirmQuery } from "@/features/app-center/lib/appCenterMutationConfirm";
import type { HermesInstance } from "./AppCenterHermesDetail";
import { normalizeHermesImage } from "../hermesImage";

export default function HermesUpgradeDialog({ instance, canWrite, onChanged }: { instance?: HermesInstance; canWrite: boolean; onChanged: () => void }) {
  const [image, setImage] = useState("");
  const [replicas, setReplicas] = useState("1");

  useEffect(() => {
    setImage(normalizeHermesImage(instance?.image || ""));
    setReplicas(String(instance?.replicas || 1));
  }, [instance]);

  const upgrade = useMutation({
    mutationFn: () =>
      apiPostJson(withAppCenterMutationConfirmQuery(`/api/app-center/hermes/instances/${encodeURIComponent(instance?.id ?? "")}/upgrade`), {
        image: normalizeHermesImage(image),
        replicas: Number(replicas) || 1,
      }),
    onSuccess: () => {
      toast.success("Hermes 已开始升级");
      onChanged();
    },
    onError: (e) => toast.error(String(e)),
  });

  const rollback = useMutation({
    mutationFn: () =>
      apiPostJson(withAppCenterMutationConfirmQuery(`/api/app-center/hermes/instances/${encodeURIComponent(instance?.id ?? "")}/rollback`), {}),
    onSuccess: () => {
      toast.success("Hermes 已开始回滚");
      onChanged();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <UploadCloud className="h-4 w-4 text-fuchsia-700" />
        <h2 className="text-sm font-semibold text-slate-950">升级/回滚</h2>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>镜像</Label>
          <Input value={image} disabled={!canWrite} onChange={(e) => setImage(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>副本</Label>
          <Input value={replicas} disabled={!canWrite} onChange={(e) => setReplicas(e.target.value)} />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">上一版本：{normalizeHermesImage(instance?.previousImage) || "-"}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!instance || !canWrite || upgrade.isPending || normalizeHermesImage(image) === normalizeHermesImage(instance?.image)} onClick={() => upgrade.mutate()}>
          {upgrade.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          升级
        </Button>
        <Button variant="outline" disabled={!instance || !canWrite || rollback.isPending || !instance?.previousImage} onClick={() => rollback.mutate()}>
          {rollback.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
          回滚
        </Button>
      </div>
    </section>
  );
}
