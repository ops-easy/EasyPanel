import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, RefreshCw, Rocket, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";

type HermesBootstrap = {
  bootstrapComplete: boolean;
  defaultNamespace: string;
  defaultMode: "gateway" | "dashboard" | "gateway-dashboard";
  defaultImage: string;
  defaultStorageSize: string;
  defaultModelProvider?: string;
  defaultModelName?: string;
  modes?: { id: string; label: string; description?: string }[];
};

type HermesInstance = {
  id: string;
  displayName: string;
  namespace: string;
  deploymentName: string;
  serviceName: string;
  image: string;
  mode: "gateway" | "dashboard" | "gateway-dashboard";
  modelProvider?: string;
  modelName?: string;
  homePvcName: string;
  secretName: string;
  configMapName: string;
  exposeMode?: string;
  ingressHost?: string;
  publicUrl?: string;
  nodePort?: number;
  replicas?: number;
  ready?: boolean;
  lastProbeError?: string;
  createdAt?: string;
};

type HermesStatus = {
  k8sAvailable?: boolean;
  deploymentFound?: boolean;
  ready?: boolean;
  readyReplicas?: number;
  desiredReplicas?: number;
  podName?: string;
  podPhase?: string;
  message?: string;
  serviceType?: string;
  ports?: { name?: string; port?: number; targetPort?: string; nodePort?: number }[];
};

const MODE_LABEL: Record<string, string> = {
  gateway: "Gateway",
  dashboard: "Dashboard",
  "gateway-dashboard": "Gateway + Dashboard",
};

const EXPOSE_MODES = ["clusterIP", "nodePort", "loadBalancer", "ingress"] as const;

export type HermesPageTab = "list" | "create" | "bootstrap";

const AppCenterHermes: React.FC<{ initialTab?: HermesPageTab }> = ({ initialTab = "list" }) => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = cloudVmAppCenterCanWrite(status?.role, status?.permissions);
  const [tab, setTab] = useState<HermesPageTab>(initialTab);
  const [apiKey, setApiKey] = useState("");
  const [notes, setNotes] = useState("");

  const bootstrapQ = useQuery({
    queryKey: ["app-hermes-bootstrap"],
    queryFn: ({ signal }) => apiGetJson<HermesBootstrap>("/api/app-center/hermes/bootstrap", { signal }),
  });

  const listQ = useQuery({
    queryKey: ["app-hermes-instances"],
    queryFn: ({ signal }) => apiGetJson<{ instances: HermesInstance[] }>("/api/app-center/hermes/instances", { signal }),
  });

  const statusQ = useQuery({
    queryKey: ["app-hermes-k8s-status"],
    queryFn: ({ signal }) => apiGetJson<{ statuses: Record<string, HermesStatus> }>("/api/app-center/hermes/instances/k8s-status", { signal }),
    enabled: tab === "list",
    refetchInterval: tab === "list" ? 20_000 : false,
  });

  const boot = bootstrapQ.data;
  const [form, setForm] = useState({
    displayName: "Hermes Agent",
    namespace: "hermes",
    deploymentName: "hermes-agent",
    serviceName: "hermes-agent",
    image: "ghcr.io/nousresearch/hermes-agent:latest",
    mode: "gateway-dashboard",
    storageSize: "10Gi",
    modelProvider: "openrouter",
    modelName: "anthropic/claude-sonnet-4.5",
    exposeMode: "clusterIP",
    ingressHost: "",
    publicUrl: "",
    nodePort: "",
    replicas: "1",
  });

  React.useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (!boot) return;
    setForm((f) => ({
      ...f,
      namespace: f.namespace || boot.defaultNamespace || "hermes",
      image: f.image || boot.defaultImage || "ghcr.io/nousresearch/hermes-agent:latest",
      mode: f.mode || boot.defaultMode || "gateway-dashboard",
      storageSize: f.storageSize || boot.defaultStorageSize || "10Gi",
      modelProvider: f.modelProvider || boot.defaultModelProvider || "",
      modelName: f.modelName || boot.defaultModelName || "",
    }));
  }, [boot]);

  const rows = useMemo(() => listQ.data?.instances ?? [], [listQ.data?.instances]);
  const readyCount = useMemo(
    () => rows.filter((x) => x.ready || statusQ.data?.statuses?.[x.id]?.ready).length,
    [rows, statusQ.data?.statuses]
  );

  const saveBootMut = useMutation({
    mutationFn: () =>
      apiPutJson<HermesBootstrap>("/api/app-center/hermes/bootstrap", {
        ...(boot ?? {}),
        bootstrapComplete: true,
        defaultNamespace: form.namespace,
        defaultMode: form.mode,
        defaultImage: form.image,
        defaultStorageSize: form.storageSize,
        defaultModelProvider: form.modelProvider,
        defaultModelName: form.modelName,
      }),
    onSuccess: () => {
      toast.success("Hermes 引导配置已保存");
      void qc.invalidateQueries({ queryKey: ["app-hermes-bootstrap"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deployMut = useMutation({
    mutationFn: () =>
      apiPostJson<{ instance: HermesInstance; apiServerKey?: string }>("/api/app-center/hermes/k8s-deploy", {
        ...form,
        nodePort: Number(form.nodePort) || 0,
        replicas: Number(form.replicas) || 1,
        secretPlaintext: {
          API_SERVER_KEY: apiKey,
        },
      }),
    onSuccess: (res) => {
      toast.success(res.apiServerKey ? "Hermes 已部署，API Server Key 已写入 Secret" : "Hermes 已部署");
      setApiKey("");
      setTab("list");
      void qc.invalidateQueries({ queryKey: ["app-hermes-instances"] });
      void qc.invalidateQueries({ queryKey: ["app-hermes-k8s-status"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/app-center/hermes/instances/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("Hermes 实例已删除");
      void qc.invalidateQueries({ queryKey: ["app-hermes-instances"] });
      void qc.invalidateQueries({ queryKey: ["app-hermes-k8s-status"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const restartMut = useMutation({
    mutationFn: (id: string) => apiPostJson(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/restart`, {}),
    onSuccess: () => {
      toast.success("已触发 Hermes 滚动重启");
      void qc.invalidateQueries({ queryKey: ["app-hermes-k8s-status"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const saveNotesMut = useMutation({
    mutationFn: (id: string) => apiPutJson(`/api/app-center/hermes/instances/${encodeURIComponent(id)}/file`, { content: notes }),
    onSuccess: () => toast.success("Hermes 备注已写入 ConfigMap"),
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-fuchsia-600">Hermes Agent</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Bot className="h-6 w-6 text-fuchsia-600" />
              Hermes 应用
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              基于 NousResearch/hermes-agent 的 K8s 部署入口：支持 Gateway、Dashboard、Gateway + Dashboard 三种模式，
              PVC 持久化、Secret 注入与 Deployment/Service 状态回读。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["list", "create", "bootstrap"] as const).map((id) => (
              <Button key={id} variant={tab === id ? "default" : "outline"} size="sm" onClick={() => setTab(id)}>
                {id === "list" ? "实例" : id === "create" ? "部署" : "引导"}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {tab === "list" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">实例</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{rows.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">就绪</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{readyCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">默认镜像</p>
              <p className="mt-1 truncate font-mono text-sm text-slate-950">{boot?.defaultImage || "-"}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-950">Hermes 实例</h2>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => statusQ.refetch()} disabled={statusQ.isFetching}>
                {statusQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新状态
              </Button>
            </div>
            <div className="overflow-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>实例</TableHead>
                    <TableHead>K8s</TableHead>
                    <TableHead>运行时</TableHead>
                    <TableHead>模式</TableHead>
                    <TableHead>暴露</TableHead>
                    <TableHead>镜像</TableHead>
                    <TableHead>端口</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQ.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">加载中…</TableCell>
                    </TableRow>
                  ) : rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">暂无 Hermes 实例</TableCell>
                    </TableRow>
                  ) : rows.map((row) => {
                    const st = statusQ.data?.statuses?.[row.id];
                    const runtimeReady = row.ready === true;
                    const publicEntry = row.publicUrl || (row.ingressHost ? `https://${row.ingressHost}` : "");
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <p className="font-medium text-slate-950">{row.displayName || row.deploymentName}</p>
                          <p className="font-mono text-xs text-slate-500">{row.namespace}/{row.deploymentName}</p>
                        </TableCell>
                        <TableCell>
                          <Badge variant={st?.ready ? "default" : "outline"}>{st?.ready ? "就绪" : st?.message || "等待状态"}</Badge>
                          {st?.podName ? <p className="mt-1 font-mono text-[11px] text-slate-500">{st.podName} · {st.podPhase}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Badge variant={runtimeReady ? "default" : "outline"}>{runtimeReady ? "可管" : "待探测"}</Badge>
                          {row.lastProbeError ? <p className="mt-1 max-w-[180px] truncate text-[11px] text-amber-700" title={row.lastProbeError}>{row.lastProbeError}</p> : null}
                        </TableCell>
                        <TableCell>{MODE_LABEL[row.mode] || row.mode}</TableCell>
                        <TableCell>
                          <p className="font-mono text-xs">{row.exposeMode || st?.serviceType || "clusterIP"}</p>
                          {publicEntry ? <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-500" title={publicEntry}>{publicEntry}</p> : null}
                        </TableCell>
                        <TableCell className="max-w-[260px] truncate font-mono text-xs" title={row.image}>{row.image}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {(st?.ports ?? []).map((p) => `${p.name}:${p.port}${p.nodePort ? `/${p.nodePort}` : ""}`).join(" / ") || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => restartMut.mutate(row.id)} disabled={!canWrite || restartMut.isPending}>
                              重启
                            </Button>
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/cluster/apps/hermes/${encodeURIComponent(row.id)}`}>详情</Link>
                            </Button>
                            <Button variant="ghost" size="sm" className="text-red-700" onClick={() => deleteMut.mutate(row.id)} disabled={!canWrite || deleteMut.isPending}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      ) : null}

      {tab === "create" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">部署到 Kubernetes</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Field label="显示名称" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
            <Field label="命名空间" value={form.namespace} onChange={(v) => setForm({ ...form, namespace: v })} mono />
            <Field label="Deployment" value={form.deploymentName} onChange={(v) => setForm({ ...form, deploymentName: v })} mono />
            <Field label="Service" value={form.serviceName} onChange={(v) => setForm({ ...form, serviceName: v })} mono />
            <Field label="镜像" value={form.image} onChange={(v) => setForm({ ...form, image: v })} mono />
            <Field label="PVC 容量" value={form.storageSize} onChange={(v) => setForm({ ...form, storageSize: v })} mono />
            <div className="space-y-1.5">
              <Label>运行模式</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(["gateway", "dashboard", "gateway-dashboard"] as const).map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setForm({ ...form, mode })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${form.mode === mode ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {MODE_LABEL[mode]}
                  </button>
                ))}
              </div>
            </div>
            <Field label="模型提供方" value={form.modelProvider} onChange={(v) => setForm({ ...form, modelProvider: v })} mono />
            <Field label="模型名" value={form.modelName} onChange={(v) => setForm({ ...form, modelName: v })} mono />
            <div className="space-y-1.5 lg:col-span-2">
              <Label>暴露方式</Label>
              <div className="grid gap-2 sm:grid-cols-4">
                {EXPOSE_MODES.map((mode) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setForm({ ...form, exposeMode: mode })}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      form.exposeMode === mode
                        ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            <Field label="副本数" value={form.replicas} onChange={(v) => setForm({ ...form, replicas: v })} mono />
            <Field label="NodePort" value={form.nodePort} onChange={(v) => setForm({ ...form, nodePort: v })} mono />
            <Field label="Ingress Host" value={form.ingressHost} onChange={(v) => setForm({ ...form, ingressHost: v })} mono />
            <Field label="Public URL" value={form.publicUrl} onChange={(v) => setForm({ ...form, publicUrl: v })} mono />
            <div className="space-y-1.5 lg:col-span-2">
              <Label>API_SERVER_KEY（可空，平台自动生成并写入 Secret）</Label>
              <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="gap-2 bg-fuchsia-600 hover:bg-fuchsia-700" disabled={!canWrite || deployMut.isPending} onClick={() => deployMut.mutate()}>
              {deployMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              部署 Hermes
            </Button>
            <Button variant="outline" className="gap-2" disabled={!canWrite || saveBootMut.isPending} onClick={() => saveBootMut.mutate()}>
              <Settings2 className="h-4 w-4" />
              同步为默认引导
            </Button>
          </div>
        </section>
      ) : null}

      {tab === "bootstrap" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">Hermes 引导配置</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            引导配置决定部署表单的默认命名空间、镜像、模式和模型字段；保存后不会覆盖已经创建的实例。
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Field label="默认命名空间" value={form.namespace} onChange={(v) => setForm({ ...form, namespace: v })} mono />
            <Field label="默认镜像" value={form.image} onChange={(v) => setForm({ ...form, image: v })} mono />
            <Field label="默认容量" value={form.storageSize} onChange={(v) => setForm({ ...form, storageSize: v })} mono />
            <Field label="默认模型" value={form.modelName} onChange={(v) => setForm({ ...form, modelName: v })} mono />
          </div>
          <Button className="mt-5 gap-2 bg-fuchsia-600 hover:bg-fuchsia-700" disabled={!canWrite || saveBootMut.isPending} onClick={() => saveBootMut.mutate()}>
            {saveBootMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            保存引导配置
          </Button>
        </section>
      ) : null}

      {rows.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">运维备注</h2>
          <p className="mt-1 text-xs text-slate-500">写入第一套 Hermes 实例的 ConfigMap，便于记录模型、上游、迁移计划等信息。</p>
          <Textarea className="mt-3 min-h-[120px] font-mono text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button className="mt-3" variant="outline" disabled={!canWrite || !rows[0]?.id || saveNotesMut.isPending} onClick={() => saveNotesMut.mutate(rows[0].id)}>
            保存备注
          </Button>
        </section>
      ) : null}
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  mono,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input className={mono ? "font-mono text-sm" : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default AppCenterHermes;
