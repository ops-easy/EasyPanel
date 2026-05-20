import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Play, RefreshCw, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Textarea } from "@/shared/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";

type HermesInstance = {
  id: string;
  displayName: string;
  namespace: string;
  deploymentName: string;
  serviceName: string;
  image: string;
  mode: string;
  modelProvider?: string;
  modelName?: string;
  homePvcName: string;
  secretName: string;
  configMapName: string;
  publicUrl?: string;
};

type HermesStatus = {
  ready?: boolean;
  message?: string;
  podName?: string;
  podPhase?: string;
  readyReplicas?: number;
  desiredReplicas?: number;
  containerStatuses?: Array<{ name?: string; ready?: boolean; state?: string; reason?: string }>;
  ports?: Array<{ name?: string; port?: number; targetPort?: string }>;
};

type HermesCommandResult = {
  ok?: boolean;
  stdout?: string;
  stderr?: string;
  command?: string[];
  pod?: string;
  container?: string;
  dryRun?: boolean;
  message?: string;
};

const AppCenterHermesDetail: React.FC = () => {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = cloudVmAppCenterCanWrite(status?.role, status?.permissions);
  const [notes, setNotes] = useState("");
  const [lastResult, setLastResult] = useState<HermesCommandResult | null>(null);

  const instQ = useQuery({
    queryKey: ["app-hermes-instance", id],
    queryFn: ({ signal }) =>
      apiGetJson<{ instance: HermesInstance }>(`/api/app-center/hermes/instances/${encodeURIComponent(id)}`, { signal }),
    enabled: Boolean(id),
  });

  const statusQ = useQuery({
    queryKey: ["app-hermes-k8s-status"],
    queryFn: ({ signal }) => apiGetJson<{ statuses: Record<string, HermesStatus> }>("/api/app-center/hermes/instances/k8s-status", { signal }),
    enabled: Boolean(id),
    refetchInterval: 20_000,
  });

  const fileQ = useQuery({
    queryKey: ["app-hermes-file", id],
    queryFn: ({ signal }) =>
      apiGetJson<{ content?: string; config?: Record<string, string> }>(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/file`, { signal }),
    enabled: Boolean(id),
    retry: false,
  });

  useEffect(() => {
    if (typeof fileQ.data?.content === "string") setNotes(fileQ.data.content);
  }, [fileQ.data?.content]);

  const inst = instQ.data?.instance;
  const st = statusQ.data?.statuses?.[id];
  const rows = useMemo(
    () => [
      ["命名空间", inst?.namespace],
      ["Deployment", inst?.deploymentName],
      ["Service", inst?.serviceName],
      ["模式", inst?.mode],
      ["镜像", inst?.image],
      ["模型", [inst?.modelProvider, inst?.modelName].filter(Boolean).join(" / ")],
      ["PVC", inst?.homePvcName],
      ["Secret", inst?.secretName],
      ["ConfigMap", inst?.configMapName],
      ["公网地址", inst?.publicUrl],
    ],
    [inst]
  );

  const probeMut = useMutation({
    mutationFn: () => apiPostJson<HermesCommandResult>(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/probe`, {}),
    onSuccess: (res) => {
      setLastResult(res);
      toast.success(res.message || "Hermes 探测完成");
      void statusQ.refetch();
    },
    onError: (e) => toast.error(String(e)),
  });

  const restartMut = useMutation({
    mutationFn: () => apiPostJson(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/restart`, {}),
    onSuccess: () => {
      toast.success("已触发滚动重启");
      void statusQ.refetch();
    },
    onError: (e) => toast.error(String(e)),
  });

  const saveFileMut = useMutation({
    mutationFn: () => apiPutJson(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/file`, { content: notes }),
    onSuccess: () => {
      toast.success("Hermes 配置备注已保存");
      void qc.invalidateQueries({ queryKey: ["app-hermes-file", id] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const dryRunMut = useMutation({
    mutationFn: () => apiPostJson<HermesCommandResult>(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/migrate-openclaw-dry-run`, {}),
    onSuccess: (res) => setLastResult(res),
    onError: (e) => toast.error(String(e)),
  });

  const migrateMut = useMutation({
    mutationFn: () =>
      apiPostJson<HermesCommandResult>(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/migrate-openclaw`, {
        preset: "user-data",
      }),
    onSuccess: (res) => setLastResult(res),
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => apiDelete(`/api/app-center/hermes/instances/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("Hermes 实例已删除");
      nav("/cluster/apps/hermes");
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <Button asChild variant="ghost" size="sm" className="mb-3 gap-1.5 px-0">
          <Link to="/cluster/apps/hermes">
            <ArrowLeft className="h-4 w-4" />
            返回 Hermes
          </Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{inst?.displayName || "Hermes 实例"}</h1>
            <p className="mt-2 font-mono text-xs text-slate-500">{inst ? `${inst.namespace}/${inst.deploymentName}` : id}</p>
          </div>
          <Badge variant={st?.ready ? "default" : "outline"}>{st?.ready ? "Ready" : st?.message || "等待状态"}</Badge>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-950">实例信息</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>字段</TableHead>
                <TableHead>值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([k, v]) => (
                <TableRow key={String(k)}>
                  <TableCell className="w-40 text-slate-500">{k}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{v || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">K8s 状态</h2>
            <p className="mt-2 text-sm text-slate-600">
              {st?.readyReplicas ?? 0}/{st?.desiredReplicas ?? 1} 副本就绪，Pod {st?.podName || "-"} {st?.podPhase || ""}
            </p>
            <div className="mt-3 space-y-2">
              {(st?.containerStatuses ?? []).map((c) => (
                <div key={c.name} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                  <span>{c.name}</span>
                  <Badge variant={c.ready ? "default" : "outline"}>{c.ready ? "ready" : c.reason || c.state || "pending"}</Badge>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">操作</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => statusQ.refetch()} disabled={statusQ.isFetching}>
                <RefreshCw className="h-4 w-4" />
                刷新
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => probeMut.mutate()} disabled={probeMut.isPending}>
                <Play className="h-4 w-4" />
                探测
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => restartMut.mutate()} disabled={!canWrite || restartMut.isPending}>
                <RotateCcw className="h-4 w-4" />
                重启
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => deleteMut.mutate()} disabled={!canWrite || deleteMut.isPending}>
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">配置备注</h2>
            <p className="mt-1 text-xs text-slate-500">写入实例 ConfigMap 的 KUBEBT_HERMES_NOTES 字段。</p>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => saveFileMut.mutate()} disabled={!canWrite || saveFileMut.isPending}>
            <Save className="h-4 w-4" />
            保存
          </Button>
        </div>
        <Textarea className="mt-3 min-h-[160px] font-mono text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {fileQ.isError ? <p className="mt-2 text-xs text-amber-700">当前无法读取 ConfigMap，K8s 未连接或资源尚未创建。</p> : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">OpenClaw 迁移</h2>
            <p className="mt-1 text-xs text-slate-500">在 Hermes Pod 内执行 hermes claw migrate，默认仅迁移 user-data preset。</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => dryRunMut.mutate()} disabled={!canWrite || dryRunMut.isPending}>
              Dry-run
            </Button>
            <Button size="sm" onClick={() => migrateMut.mutate()} disabled={!canWrite || migrateMut.isPending}>
              执行迁移
            </Button>
          </div>
        </div>
        {lastResult ? (
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-50">
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        ) : null}
      </section>
    </div>
  );
};

export default AppCenterHermesDetail;
