import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  Link2,
  Loader2,
  LockKeyhole,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import PveTargetForm, {
  defaultPveTargetForm,
  pveTargetFormFromTarget,
  type PVETarget,
  type PveTargetFormState,
} from "./PveTargetForm";
import { withPveMutationConfirm, withPveMutationConfirmQuery } from "@/features/compute/pve/lib/pveMutationConfirm";

function fmtUpdatedAt(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function pveCredentialStatus(target?: PVETarget): string {
  if (!target) return "未配置";
  if (target.passwordSet) return target.passwordPreview || "密码已保存";
  if (target.tokenSecretSet) return target.tokenSecretPreview || "Token 已保存";
  return "未保存";
}

type TargetSummaryItemProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: typeof PlugZap;
};

const TargetSummaryItem: React.FC<TargetSummaryItemProps> = ({ label, value, hint, icon: Icon }) => (
  <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
    <div className="truncate text-sm font-semibold text-slate-950">{value}</div>
    {hint ? <div className="mt-1 truncate text-[11px] text-slate-500">{hint}</div> : null}
  </div>
);

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
      const payload = withPveMutationConfirm({ ...form, password });
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
    mutationFn: (id: string) => apiDelete(withPveMutationConfirmQuery(`/api/pve/targets/${encodeURIComponent(id)}`)),
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

  const targetStatus = active ? "已配置" : targetsQ.isLoading ? "读取中" : "未配置";

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
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={active ? "secondary" : "outline"}>{targetStatus}</Badge>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void targetsQ.refetch()} disabled={targetsQ.isFetching}>
              {targetsQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
          </div>
        </div>
      </div>
      <div className="space-y-5 p-6">
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">当前 PVE 目标</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {targetsQ.isLoading
                  ? "正在读取 PVE 目标..."
                  : active
                    ? "已保存唯一 PVE 目标，可在这里更新凭据或探测连通性。"
                    : "尚未配置 PVE API 目标，下方填写后即可纳管节点、虚拟机和存储。"}
              </p>
            </div>
            {active ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => probeMut.mutate(active.id)} disabled={!canWrite || probeMut.isPending}>
                  <ShieldCheck className="h-4 w-4" />
                  探测
                </Button>
                <ConfirmActionButton
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-red-700"
                  disabled={!canWrite || deleteMut.isPending}
                  title="确认删除 PVE 目标？"
                  description="将从平台配置中移除当前 PVE 连接目标，算力资源中心会停止按该目标读取。"
                  confirmLabel="删除"
                  confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
                  onConfirm={() => deleteMut.mutate(active.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  删除
                </ConfirmActionButton>
              </div>
            ) : null}
          </div>
          <div className="target-summary-grid mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TargetSummaryItem
              icon={PlugZap}
              label="目标名称"
              value={active?.name || "未配置"}
              hint={active ? "Proxmox VE" : "填写下方连接参数"}
            />
            <TargetSummaryItem
              icon={Link2}
              label="API 地址"
              value={active?.baseUrl || "未填写"}
              hint={active?.prometheusJob ? `监控 job：${active.prometheusJob}` : "https://host:8006"}
            />
            <TargetSummaryItem
              icon={UserRound}
              label="账号"
              value={active?.username || active?.tokenId || "未填写"}
              hint={<Badge className="w-fit" variant={active?.passwordSet || active?.tokenSecretSet ? "secondary" : "outline"}>{pveCredentialStatus(active)}</Badge>}
            />
            <TargetSummaryItem
              icon={active?.skipTls === false ? LockKeyhole : CalendarClock}
              label={active?.skipTls === false ? "TLS 校验" : "更新时间"}
              value={active?.skipTls === false ? "严格校验" : fmtUpdatedAt(active?.updatedAt)}
              hint={active?.skipTls === false ? fmtUpdatedAt(active?.updatedAt) : "跳过自签证书校验"}
            />
          </div>
        </div>
        <PveTargetForm
          form={form}
          setForm={setForm}
          canWrite={canWrite}
          pending={saveMut.isPending}
          onSubmit={() => saveMut.mutate()}
          title="连接参数"
          submitLabel={active ? "保存 PVE 目标" : "保存目标"}
          embedded
        />
      </div>
    </section>
  );
};

export default PveTargetSettingsPanel;
