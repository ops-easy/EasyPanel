import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { apiPostJson } from "@/lib/api";
import type { HermesInstance, HermesStatus } from "./AppCenterHermesDetail";

type ProbeResult = {
  ready?: boolean;
  gatewayOk?: boolean;
  dashboardOk?: boolean;
  models?: string[];
  message?: string;
  errors?: string[];
};

export default function HermesProbePanel({
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
  const [result, setResult] = useState<ProbeResult | null>(null);
  const probe = useMutation({
    mutationFn: () => apiPostJson<ProbeResult>(`/api/app-center/hermes/instances/${encodeURIComponent(instance?.id ?? "")}/probe`, {}),
    onSuccess: (res) => {
      setResult(res);
      if (res.ready) {
        toast.success(res.message || "Hermes 探测完成");
      } else {
        toast.warning(res.message || "Hermes 探测完成");
      }
      onChanged();
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">运行时探测</h2>
        <Badge variant={instance?.ready ? "default" : "outline"}>{instance?.ready ? "可作为 AI Provider" : "未就绪"}</Badge>
      </div>
      <div className="grid gap-2 text-sm text-slate-600">
        <p>K8s：{status?.ready ? "Ready" : status?.message || "未知"}</p>
        <p>Gateway：{result ? (result.gatewayOk ? "通过" : "未通过") : instance?.ready ? "上次通过" : "待探测"}</p>
        <p>Dashboard：{result ? (result.dashboardOk ? "通过" : "未通过") : "待探测"}</p>
        <p>模型：{result?.models?.join(", ") || instance?.modelName || "-"}</p>
      </div>
      {result?.errors?.length ? (
        <pre className="mt-3 max-h-32 overflow-auto rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {result.errors.join("\n")}
        </pre>
      ) : null}
      <Button className="mt-4" variant="outline" disabled={!instance || !canWrite || probe.isPending} onClick={() => probe.mutate()}>
        {probe.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        执行真实探测
      </Button>
    </section>
  );
}
