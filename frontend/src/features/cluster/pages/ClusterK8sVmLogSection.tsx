import React, { useCallback, useEffect, useState } from "react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { withOpsMutationConfirm } from "@/lib/ops-mutation-confirm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Loader2, Save } from "lucide-react";
import { apiGetJson, apiPostJson, apiPutJson, type RuntimeSettingsDTO } from "@/lib/api";
import { withK8sMutationConfirm } from "@/features/cluster/lib/k8sMutationConfirm";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/shared/ui/button";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { toast } from "sonner";

type VmLogDiscoverItem = {
  namespace: string;
  service: string;
  suggestedUrl: string;
  port: number;
  hint: string;
};

type VmLogDiscoverRes = {
  namespace: string;
  items: VmLogDiscoverItem[];
};

type VmLogNamespacesRes = {
  namespaces: string[];
};

type VmLogAddonStatus = {
  victoriaLogs?: {
    namespace?: string;
    releaseName?: string;
    serviceName?: string;
    internalUrl?: string;
    installed?: boolean;
    statefulSetReady?: boolean;
    runtimeUrlHint?: string;
    collectorInstallHint?: string;
    datasourceBoundaryHint?: string;
  };
};

type VmLogAddonVerification = {
  ok: boolean;
  checkedAt?: string;
  checks?: { name: string; ok: boolean; detail?: string }[];
  issues?: string[];
  remedies?: string[];
  waitedSeconds?: number;
};

const ClusterK8sVmLogSection: React.FC = () => {
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const qc = useQueryClient();
  const [form, setForm] = useState<RuntimeSettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickNs, setPickNs] = useState<string>("");
  const [installing, setInstalling] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [installNamespace, setInstallNamespace] = useState("easypanel-logging");
  const [installRelease, setInstallRelease] = useState("eplogs");
  const [installRetentionDays, setInstallRetentionDays] = useState(180);
  const [installStorageClassName, setInstallStorageClassName] = useState("");
  const [installStorageSize, setInstallStorageSize] = useState("20Gi");
  const [collectorEnabled, setCollectorEnabled] = useState(true);
  const [autoWriteRuntime, setAutoWriteRuntime] = useState(true);
  const [verification, setVerification] = useState<VmLogAddonVerification | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGetJson<RuntimeSettingsDTO>("/api/settings/runtime");
      setForm(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nsQ = useQuery({
    queryKey: ["ops-vmlog-namespaces"],
    queryFn: ({ signal }) => apiGetJson<VmLogNamespacesRes>("/api/ops/vmlog/namespaces", { signal }),
    retry: 1,
  });

  const discQ = useQuery({
    queryKey: ["ops-vmlog-discover", pickNs],
    queryFn: ({ signal }) =>
      apiGetJson<VmLogDiscoverRes>(`/api/ops/vmlog/discover?namespace=${encodeURIComponent(pickNs)}`, { signal }),
    enabled: pickNs.trim() !== "",
    retry: 1,
  });

  const addonsQ = useQuery({
    queryKey: ["k8s-addons-status", "victoria-logs"],
    queryFn: ({ signal }) => apiGetJson<VmLogAddonStatus>("/api/k8s/addons/status", { signal }),
    retry: 1,
    refetchInterval: 30_000,
  });

  const victoriaUrl = String(form?.victoriaLogsUrl ?? "").trim();
  const retentionDays = Number(form?.victoriaLogsRetentionDays ?? 180) || 180;

  useEffect(() => {
    const vl = addonsQ.data?.victoriaLogs;
    if (vl?.namespace) setInstallNamespace(vl.namespace);
    if (vl?.releaseName) setInstallRelease(vl.releaseName);
    if (retentionDays > 0) setInstallRetentionDays(retentionDays);
  }, [addonsQ.data?.victoriaLogs, retentionDays]);

  const onSave = async () => {
    if (!form || !isAdmin) return;
    setSaving(true);
    try {
      const payload = { ...form } as Record<string, unknown>;
      await apiPutJson("/api/settings/runtime", withOpsMutationConfirm(payload));
      toast.success("已保存 VictoriaLogs 地址");
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["runtime-status"] });
      void qc.invalidateQueries({ queryKey: ["ops-vmlog-status"] });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      toast.success("已复制 URL");
    } catch {
      toast.error("复制失败");
    }
  };

  const applyUrl = (u: string) => {
    setForm((prev) => (prev ? { ...prev, victoriaLogsUrl: u } : prev));
    toast.message("已填入地址，请点击保存");
  };

  const installVictoriaLogs = async () => {
    if (!isAdmin) return;
    setInstalling(true);
    setVerification(null);
    try {
      const res = await apiPostJson<{
        message?: string;
        victoriaLogsUrl?: string;
        runtimePatched?: boolean;
        patchError?: string;
        verification?: VmLogAddonVerification;
      }>(
        "/api/k8s/addons/victoria-logs/install",
        withK8sMutationConfirm({
          namespace: installNamespace,
          releaseName: installRelease,
          retentionDays: installRetentionDays,
          storageClassName: installStorageClassName,
          storageSize: installStorageSize,
          collectorEnabled,
          autoWriteRuntime,
        })
      );
      if (res.verification) setVerification(res.verification);
      if (res.victoriaLogsUrl) setForm((prev) => (prev ? { ...prev, victoriaLogsUrl: res.victoriaLogsUrl } : prev));
      if (res.runtimePatched && res.victoriaLogsUrl) {
        setForm((prev) =>
          prev
            ? { ...prev, victoriaLogsUrl: res.victoriaLogsUrl, victoriaLogsRetentionDays: installRetentionDays }
            : prev,
        );
      }
      const msg = String(res.message || "").trim() || "VictoriaLogs 部署流程已完成";
      if (res.patchError || (res.verification && !res.verification.ok)) toast.warning(msg);
      else toast.success(msg);
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
      void qc.invalidateQueries({ queryKey: ["ops-vmlog-status"] });
      void qc.invalidateQueries({ queryKey: APP_CONFIG_QUERY_KEY });
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setInstalling(false);
    }
  };

  const verifyVictoriaLogs = async () => {
    setVerifying(true);
    try {
      const qs = new URLSearchParams({
        namespace: installNamespace,
        releaseName: installRelease,
        maxWaitSec: "180",
      });
      const res = await apiGetJson<{ verification: VmLogAddonVerification }>(
        `/api/k8s/addons/victoria-logs/verify?${qs.toString()}`,
      );
      setVerification(res.verification);
      if (res.verification.ok) toast.success("VictoriaLogs 自检通过");
      else toast.warning("VictoriaLogs 自检未完全通过，请查看报告");
      void qc.invalidateQueries({ queryKey: ["k8s-addons-status"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setVerifying(false);
    }
  };

  const namespaces = nsQ.data?.namespaces ?? [];

  return (
    <Card className="border-cyan-200/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">VictoriaLogs（VMLog）</CardTitle>
        <CardDescription>
          供「AI 巡检 → 日志查询」使用：选择命名空间后自动发现疑似 VictoriaLogs 的 Service，一键填入内网根地址（端口多为 9428）。亦可手动填写 Helm release 的 Service
          URL。环境变量 <code className="font-mono text-xs">VICTORIA_LOGS_URL</code> 与此处运行时字段合并，运行时优先。默认保留{" "}
          <strong>180</strong> 天用于本页时间窗上限；请在 Helm 中为 VL 配置实际 retention。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {loading ? (
          <div className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载运行时…
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-cyan-200/90 bg-cyan-50/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-cyan-950">一键部署 VictoriaLogs</p>
                {addonsQ.data?.victoriaLogs?.installed ? (
                  <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">已就绪</span>
                ) : (
                  <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">未就绪</span>
                )}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-cyan-950/90">
                VictoriaLogs 是日志系统，使用 LogsQL / VMLog 查询；Prometheus / VictoriaMetrics vmselect 是指标系统，不是同一个入口。
                单库 chart 负责存储，collector chart 负责采集 Kubernetes 容器日志。
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">目标命名空间</Label>
                  <Input className="font-mono text-xs" value={installNamespace} disabled={!isAdmin} onChange={(e) => setInstallNamespace(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Helm release</Label>
                  <Input className="font-mono text-xs" value={installRelease} disabled={!isAdmin} onChange={(e) => setInstallRelease(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">retentionDays</Label>
                  <Input
                    type="number"
                    min={7}
                    max={730}
                    className="font-mono text-xs"
                    value={installRetentionDays}
                    disabled={!isAdmin}
                    onChange={(e) => setInstallRetentionDays(parseInt(e.target.value, 10) || 180)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">PVC 大小</Label>
                  <Input className="font-mono text-xs" value={installStorageSize} disabled={!isAdmin} onChange={(e) => setInstallStorageSize(e.target.value)} placeholder="20Gi" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">StorageClass（可选）</Label>
                  <Input
                    className="font-mono text-xs"
                    value={installStorageClassName}
                    disabled={!isAdmin}
                    onChange={(e) => setInstallStorageClassName(e.target.value)}
                    placeholder="留空使用集群默认"
                  />
                </div>
                <div className="space-y-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={collectorEnabled} disabled={!isAdmin} onChange={(e) => setCollectorEnabled(e.target.checked)} />
                    部署 victoria-logs-collector 采集容器日志
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={autoWriteRuntime} disabled={!isAdmin} onChange={(e) => setAutoWriteRuntime(e.target.checked)} />
                    安装后自动写入 victoriaLogsUrl
                  </label>
                </div>
              </div>
              {addonsQ.data?.victoriaLogs?.internalUrl ? (
                <p className="mt-2 break-all font-mono text-[11px] text-cyan-900">{addonsQ.data.victoriaLogs.internalUrl}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <ConfirmActionButton
                  type="button"
                  disabled={!isAdmin || installing || verifying}
                  title="确认安装或升级 VictoriaLogs？"
                  description="将在集群内安装或升级 VictoriaLogs 与采集组件，并写入相关 Kubernetes 资源。"
                  confirmLabel="安装/升级"
                  onConfirm={() => void installVictoriaLogs()}
                >
                  {installing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  安装 / 升级 VictoriaLogs
                </ConfirmActionButton>
                <Button type="button" variant="outline" disabled={verifying || installing} onClick={() => void verifyVictoriaLogs()}>
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  自检
                </Button>
              </div>
              {verification ? (
                <div className="mt-3 rounded-md border border-white bg-white/80 px-3 py-2 text-[11px]">
                  <p className={verification.ok ? "font-medium text-emerald-700" : "font-medium text-amber-800"}>
                    {verification.ok ? "自检通过" : "自检未完全通过"}
                    {verification.waitedSeconds ? ` · ${verification.waitedSeconds}s` : ""}
                  </p>
                  {verification.checks?.map((c) => (
                    <p key={c.name} className="mt-1">
                      <span className={c.ok ? "text-emerald-700" : "text-red-700"}>{c.ok ? "OK" : "FAIL"}</span>{" "}
                      <span className="font-mono">{c.name}</span>
                      {c.detail ? <span className="ml-1 text-slate-600">{c.detail}</span> : null}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">victoriaLogsUrl（HTTP 根地址，无路径尾缀）</Label>
              <Input
                className="font-mono text-xs"
                placeholder="http://victoria-logs-single.monitoring.svc:9428"
                value={victoriaUrl}
                disabled={!isAdmin}
                onChange={(e) => setForm((prev) => (prev ? { ...prev, victoriaLogsUrl: e.target.value } : prev))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">victoriaLogsRetentionDays（目标保留天数，7–730，默认 180）</Label>
              <Input
                type="number"
                min={7}
                max={730}
                className="max-w-[200px] font-mono text-xs"
                value={retentionDays}
                disabled={!isAdmin}
                onChange={(e) =>
                  setForm((prev) =>
                    prev ? { ...prev, victoriaLogsRetentionDays: parseInt(e.target.value, 10) || 180 } : prev
                  )
                }
              />
              <p className="text-[11px] text-slate-600">
                控制「日志查询」页可选的最长时间窗；与 VictoriaLogs 服务端 retention 请保持一致，避免查超出实际保留的数据。
              </p>
            </div>

            <div className="rounded-lg border border-slate-200/90 bg-slate-50/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-800">按命名空间发现 Service</p>
              {nsQ.isLoading ? (
                <p className="text-xs text-slate-500">读取命名空间…</p>
              ) : nsQ.isError ? (
                <p className="text-xs text-amber-800">{(nsQ.error as Error).message}</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Kubernetes namespace</Label>
                    <Select value={pickNs || "__none__"} onValueChange={(v) => setPickNs(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="font-mono text-xs">
                        <SelectValue placeholder="选择命名空间" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        <SelectItem value="__none__">未选择</SelectItem>
                        {namespaces.map((n) => (
                          <SelectItem key={n} value={n}>
                            {n}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] text-slate-600 sm:pb-2">
                    仅列出名称或标签疑似 VictoriaLogs 的 Service；若 chart 命名特殊请手动填写上方 URL。
                  </p>
                </div>
              )}
              {pickNs && discQ.isFetching ? (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  探测 {pickNs} …
                </div>
              ) : null}
              {pickNs && discQ.data?.items?.length === 0 && !discQ.isFetching ? (
                <p className="text-xs text-slate-600">该命名空间下未发现名称含 victoria-logs / vmlog 或标签匹配的 Service。</p>
              ) : null}
              {discQ.data?.items && discQ.data.items.length > 0 ? (
                <ul className="space-y-2">
                  {discQ.data.items.map((it) => (
                    <li
                      key={`${it.namespace}/${it.service}`}
                      className="flex flex-col gap-2 rounded-md border border-white bg-white/90 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-xs text-slate-900">
                          {it.namespace}/{it.service}
                          <span className="ml-2 text-slate-500">:{it.port}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">{it.hint}</p>
                        <p className="mt-1 font-mono text-[11px] text-cyan-900">{it.suggestedUrl}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" size="sm" disabled={!isAdmin} onClick={() => applyUrl(it.suggestedUrl)}>
                          填入地址
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl(it.suggestedUrl)}>
                          <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
                          复制
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {isAdmin ? (
              <ConfirmActionButton
                type="button"
                disabled={saving}
                title="确认保存 VictoriaLogs 运行时？"
                description="将保存 VictoriaLogs 查询地址、保留期与采集器下载配置到平台运行时。"
                confirmLabel="保存"
                onConfirm={() => void onSave()}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                保存到运行时
              </ConfirmActionButton>
            ) : (
              <p className="text-xs text-slate-500">仅管理员可修改并保存。</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ClusterK8sVmLogSection;
