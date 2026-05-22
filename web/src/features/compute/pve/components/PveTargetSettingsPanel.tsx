import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import PveTargetForm, {
  defaultPveTargetForm,
  pveTargetFormFromTarget,
  type PVETarget,
  type PveTargetFormState,
} from "./PveTargetForm";

function fmtUpdatedAt(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

const PveTargetSettingsPanel: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.compute === "rw" || status?.permissions?.vcenter === "rw";
  const [form, setForm] = useState<PveTargetFormState>(() => ({ ...defaultPveTargetForm }));

  const targetsQ = useQuery({
    queryKey: ["pve-targets"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
  });

  const targets = useMemo(() => targetsQ.data?.targets ?? [], [targetsQ.data?.targets]);
  const active = targets[0];

  useEffect(() => {
    setForm(pveTargetFormFromTarget(active));
  }, [active]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const password = form.password.trim() || (active?.passwordSet ? "***" : "");
      const payload = { ...form, password };
      if (active?.id) {
        return apiPutJson<{ target: PVETarget }>(`/api/pve/targets/${encodeURIComponent(active.id)}`, payload);
      }
      return apiPostJson<{ target: PVETarget }>("/api/pve/targets", payload);
    },
    onSuccess: () => {
      toast.success(active ? "PVE 目标已更新" : "PVE 目标已保存");
      void qc.invalidateQueries({ queryKey: ["pve-targets"] });
      void qc.invalidateQueries({ queryKey: ["pve-summary"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/pve/targets/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("PVE 目标已删除");
      setForm({ ...defaultPveTargetForm });
      void qc.invalidateQueries({ queryKey: ["pve-targets"] });
      void qc.invalidateQueries({ queryKey: ["pve-summary"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const probeMut = useMutation({
    mutationFn: (id: string) => apiPostJson<{ ok?: boolean; error?: string }>(`/api/pve/targets/${encodeURIComponent(id)}/probe`, {}),
    onSuccess: (res) => toast[res.ok ? "success" : "error"](res.ok ? "PVE API 连通" : res.error || "PVE API 探测失败"),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/70 px-6 py-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Proxmox VE</p>
            <h2 className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950">
              <PlugZap className="h-4 w-4 text-amber-600" />
              PVE 目标
            </h2>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-500">
              维护唯一 Proxmox VE API 目标。基础资源、虚拟机 / CT、电源任务仍走 PVE API；GPU 与主机 exporter 时序在下方监控数据源中配置。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void targetsQ.refetch()} disabled={targetsQ.isFetching}>
              {targetsQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
            {active ? (
              <>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => probeMut.mutate(active.id)} disabled={!canWrite || probeMut.isPending}>
                  <ShieldCheck className="h-4 w-4" />
                  探测
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => deleteMut.mutate(active.id)} disabled={!canWrite || deleteMut.isPending}>
                  <Trash2 className="h-4 w-4" />
                  删除
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid gap-5 p-6 xl:grid-cols-[320px_1fr]">
        <PveTargetForm
          form={form}
          setForm={setForm}
          canWrite={canWrite}
          pending={saveMut.isPending}
          onSubmit={() => saveMut.mutate()}
          title={active ? "更新 PVE 目标" : "新增 PVE 目标"}
          submitLabel={active ? "保存 PVE 目标" : "保存目标"}
          embedded
        />
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-sm font-semibold text-slate-950">当前目标</p>
            <p className="mt-1 text-xs text-slate-500">
              {targetsQ.isLoading ? "正在读取 PVE 目标..." : active ? "已保存唯一 PVE 目标，可在这里更新凭据或探测连通性。" : "尚未配置 PVE 目标。"}
            </p>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>API 地址</TableHead>
                  <TableHead>账号</TableHead>
                  <TableHead>Prometheus job</TableHead>
                  <TableHead>更新时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {targetsQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : null}
                {!targetsQ.isLoading && !active ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      还没有 PVE 目标
                    </TableCell>
                  </TableRow>
                ) : null}
                {active ? (
                  <TableRow>
                    <TableCell className="font-medium text-slate-950">{active.name}</TableCell>
                    <TableCell className="min-w-64 break-all font-mono text-xs">{active.baseUrl}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <span>{active.username || active.tokenId || "-"}</span>
                        <Badge className="w-fit" variant={active.passwordSet || active.tokenSecretSet ? "secondary" : "outline"}>
                          {active.passwordSet ? active.passwordPreview || "密码已保存" : active.tokenSecretSet ? active.tokenSecretPreview || "Token 已保存" : "未保存"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{active.prometheusJob || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtUpdatedAt(active.updatedAt)}</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PveTargetSettingsPanel;
