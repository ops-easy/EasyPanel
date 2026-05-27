import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, ChevronLeft, ChevronRight, Loader2, RefreshCw, Rocket, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { cloudVmAppCenterCanWrite } from "@/lib/platform-permissions";
import { HERMES_DEFAULT_IMAGE, normalizeHermesImage } from "../hermesImage";

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

const HERMES_BOOTSTRAP_PATH = "/cluster/apps/hermes/bootstrap";

const HERMES_CAPABILITIES = [
  { title: "部署实例", detail: "下发 Gateway、Dashboard 或组合模式，并写入 PVC、Secret、ConfigMap 与 Service。" },
  { title: "运行时探测", detail: "进入实例详情后可执行真实探测，确认 Gateway、Dashboard 与模型列表是否可用。" },
  { title: "访问暴露", detail: "支持 clusterIP、nodePort、loadBalancer 与 ingress，详情页可直接调整暴露配置。" },
  { title: "升级/回滚", detail: "在详情页切换镜像、副本，并保留上一版本镜像用于回滚。" },
  { title: "日志与事件", detail: "拉取 Pod 日志和相关 Kubernetes Events，便于排查启动和运行问题。" },
  { title: "OpenClaw 迁移", detail: "在 Hermes Pod 内执行 hermes claw migrate，承接 OpenClaw user-data 数据。" },
] as const;

const HERMES_STEPS = [
  { n: 1, title: "K8s 资源", detail: "命名空间、Deployment、Service、镜像" },
  { n: 2, title: "运行与暴露", detail: "运行模式、PVC、副本、访问方式" },
  { n: 3, title: "模型与密钥", detail: "模型提供方、模型名、API Server Key" },
] as const;

export type HermesPageTab = "list" | "create" | "bootstrap";

const AppCenterHermes: React.FC<{ initialTab?: HermesPageTab }> = ({ initialTab = "create" }) => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = cloudVmAppCenterCanWrite(status?.role, status?.permissions);
  const [tab, setTab] = useState<HermesPageTab>(initialTab);
  const [step, setStep] = useState(1);
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
    image: HERMES_DEFAULT_IMAGE,
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
    if (initialTab === "create") {
      setStep(1);
    }
  }, [initialTab]);

  React.useEffect(() => {
    if (!boot) return;
    setForm((f) => ({
      ...f,
      namespace: f.namespace || boot.defaultNamespace || "hermes",
      image: normalizeHermesImage(f.image || boot.defaultImage || HERMES_DEFAULT_IMAGE),
      mode: f.mode || boot.defaultMode || "gateway-dashboard",
      storageSize: f.storageSize || boot.defaultStorageSize || "10Gi",
      modelProvider: f.modelProvider || boot.defaultModelProvider || "",
      modelName: f.modelName || boot.defaultModelName || "",
    }));
  }, [boot]);

  const rows = useMemo(
    () => (listQ.data?.instances ?? []).map((row) => ({ ...row, image: normalizeHermesImage(row.image) })),
    [listQ.data?.instances]
  );
  const defaultImageLabel = normalizeHermesImage(boot?.defaultImage);
  const readyCount = useMemo(
    () => rows.filter((x) => x.ready || statusQ.data?.statuses?.[x.id]?.ready).length,
    [rows, statusQ.data?.statuses]
  );
  const modeOptions = useMemo(
    () =>
      boot?.modes?.length
        ? boot.modes
        : (["gateway", "dashboard", "gateway-dashboard"] as const).map((id) => ({
            id,
            label: MODE_LABEL[id],
          })),
    [boot?.modes]
  );

  const goNext = () => {
    if (step < 3) setStep((s) => s + 1);
  };

  const goPrev = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const onTabChange = (value: string) => {
    const next = value as HermesPageTab;
    setTab(next);
    if (next === "create") {
      setStep(1);
    }
  };

  const saveBootMut = useMutation({
    mutationFn: () =>
      apiPutJson<HermesBootstrap>("/api/app-center/hermes/bootstrap", {
        ...(boot ?? {}),
        bootstrapComplete: true,
        defaultNamespace: form.namespace,
        defaultMode: form.mode,
        defaultImage: normalizeHermesImage(form.image) || HERMES_DEFAULT_IMAGE,
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
        image: normalizeHermesImage(form.image) || HERMES_DEFAULT_IMAGE,
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
      setStep(1);
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

  if (bootstrapQ.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载…
      </p>
    );
  }

  if (boot && !boot.bootstrapComplete && !canWrite) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Hermes 尚未完成首次引导。请联系管理员打开{" "}
        <Link to={HERMES_BOOTSTRAP_PATH} className="font-mono font-semibold underline">
          {HERMES_BOOTSTRAP_PATH}
        </Link>{" "}
        完成配置。
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-slate-50/80 px-6 py-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-900/80">应用中心</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Bot className="h-7 w-7 text-indigo-600" />
          Hermes 应用
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          基于 NousResearch/hermes-agent 的 K8s 部署入口：支持 Gateway、Dashboard、Gateway + Dashboard 三种模式，
          PVC 持久化、Secret 注入、访问暴露、运行时探测、升级回滚与日志事件回读。
        </p>
      </section>

      <Tabs value={tab} onValueChange={onTabChange} className="gap-3">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1">
          <TabsTrigger value="create" className="rounded-lg">
            部署向导
          </TabsTrigger>
          <TabsTrigger value="bootstrap" className="rounded-lg">
            模板配置
          </TabsTrigger>
          <TabsTrigger value="list" className="rounded-lg">
            已部署实例
          </TabsTrigger>
        </TabsList>

      {tab === "list" ? (
        <TabsContent value="list" className="outline-none">
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
              <p className="mt-1 truncate font-mono text-sm text-slate-950">{defaultImageLabel || "-"}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">Hermes 管理能力</h2>
                <p className="mt-1 text-xs text-slate-500">创建实例后，完整运维能力集中在实例详情页。</p>
              </div>
              {canWrite ? (
                <Button type="button" size="sm" className="gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={() => onTabChange("create")}>
                  <Rocket className="h-4 w-4" />
                  部署实例
                </Button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {HERMES_CAPABILITIES.map((item) => (
                <div key={item.title} className="min-h-[92px] rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-3">
                  <p className="text-sm font-medium text-slate-950">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
                </div>
              ))}
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
                      <TableCell colSpan={8} className="py-10 text-center">
                        <div className="flex flex-col items-center gap-3 text-sm text-slate-500">
                          <span>暂无 Hermes 实例</span>
                          {canWrite ? (
                            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => onTabChange("create")}>
                              <Rocket className="h-4 w-4" />
                              部署实例
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
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
        </TabsContent>
      ) : null}

      {tab === "create" ? (
        <TabsContent value="create" className="outline-none">
        <section>
          <Card className="border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">部署 Hermes</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                与 OpenClaw 相同的分步流程：先确认 K8s 资源，再设置运行与暴露，最后填写模型和密钥后部署。
              </CardDescription>
              <ol className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {HERMES_STEPS.map((item) => {
                  const active = step === item.n;
                  const done = step > item.n;
                  return (
                    <li
                      key={item.n}
                      className={`rounded-lg border px-3 py-3 text-sm ${
                        active
                          ? "border-indigo-400 bg-indigo-50/90"
                          : done
                            ? "border-emerald-200/80 bg-emerald-50/50"
                            : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                            active ? "bg-indigo-600 text-white" : done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {item.n}
                        </span>
                        <div>
                          <p className="font-medium text-slate-950">{item.title}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardHeader>
            <CardContent className="space-y-4">
              {step === 1 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="显示名称" value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
                  <Field label="命名空间" value={form.namespace} onChange={(v) => setForm({ ...form, namespace: v })} mono />
                  <Field label="Deployment" value={form.deploymentName} onChange={(v) => setForm({ ...form, deploymentName: v })} mono />
                  <Field label="Service" value={form.serviceName} onChange={(v) => setForm({ ...form, serviceName: v })} mono />
                  <div className="space-y-1.5 lg:col-span-2">
                    <Field label="镜像" value={form.image} onChange={(v) => setForm({ ...form, image: v })} mono />
                    <p className="text-xs leading-5 text-slate-500">
                      镜像和默认命名空间来自模板配置，可在「模板配置」页统一调整。
                    </p>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>运行模式</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {modeOptions.map((mode) => (
                        <button
                          type="button"
                          key={mode.id}
                          onClick={() => setForm({ ...form, mode: mode.id })}
                          className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                            form.mode === mode.id ? "border-indigo-300 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {mode.label || MODE_LABEL[mode.id] || mode.id}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="PVC 容量" value={form.storageSize} onChange={(v) => setForm({ ...form, storageSize: v })} mono />
                  <Field label="副本数" value={form.replicas} onChange={(v) => setForm({ ...form, replicas: v })} mono />
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>暴露方式</Label>
                    <div className="grid gap-2 sm:grid-cols-4">
                      {EXPOSE_MODES.map((mode) => (
                        <button
                          type="button"
                          key={mode}
                          onClick={() => setForm({ ...form, exposeMode: mode })}
                          className={`rounded-lg border px-3 py-2 text-left text-sm font-medium ${
                            form.exposeMode === mode
                              ? "border-indigo-300 bg-indigo-50 text-indigo-900"
                              : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="NodePort" value={form.nodePort} onChange={(v) => setForm({ ...form, nodePort: v })} mono />
                  <Field label="Ingress Host" value={form.ingressHost} onChange={(v) => setForm({ ...form, ingressHost: v })} mono />
                  <Field label="Public URL" value={form.publicUrl} onChange={(v) => setForm({ ...form, publicUrl: v })} mono />
                </div>
              ) : null}

              {step === 3 ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="模型提供方" value={form.modelProvider} onChange={(v) => setForm({ ...form, modelProvider: v })} mono />
                  <Field label="模型名" value={form.modelName} onChange={(v) => setForm({ ...form, modelName: v })} mono />
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label>API_SERVER_KEY（可空，平台自动生成并写入 Secret）</Label>
                    <Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 text-xs leading-5 text-slate-600 lg:col-span-2">
                    将创建 <span className="font-mono text-slate-800">{form.namespace || "hermes"}</span> 命名空间内的 Hermes Deployment、
                    Service、PVC 与 Secret；保存模板配置只同步当前默认值，不会覆盖已创建实例。
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" size="sm" className="gap-1" onClick={goPrev} disabled={step <= 1}>
                  <ChevronLeft className="h-4 w-4" />
                  上一步
                </Button>
                {step < 3 ? (
                  <Button type="button" size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700" onClick={goNext}>
                    下一步
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" className="gap-2" disabled={!canWrite || saveBootMut.isPending} onClick={() => saveBootMut.mutate()}>
                      <Settings2 className="h-4 w-4" />
                      同步为默认引导
                    </Button>
                    <Button type="button" size="sm" className="gap-2 bg-indigo-600 hover:bg-indigo-700" disabled={!canWrite || deployMut.isPending} onClick={() => deployMut.mutate()}>
                      {deployMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                      部署 Hermes
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </section>
        </TabsContent>
      ) : null}

      {tab === "bootstrap" ? (
        <TabsContent value="bootstrap" className="outline-none">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-950">Hermes 模板配置</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            引导配置决定部署表单的默认命名空间、镜像、模式和模型字段；保存后不会覆盖已经创建的实例。
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Field label="默认命名空间" value={form.namespace} onChange={(v) => setForm({ ...form, namespace: v })} mono />
            <Field label="默认镜像" value={form.image} onChange={(v) => setForm({ ...form, image: v })} mono />
            <Field label="默认容量" value={form.storageSize} onChange={(v) => setForm({ ...form, storageSize: v })} mono />
            <Field label="默认模型提供方" value={form.modelProvider} onChange={(v) => setForm({ ...form, modelProvider: v })} mono />
            <Field label="默认模型" value={form.modelName} onChange={(v) => setForm({ ...form, modelName: v })} mono />
            <div className="space-y-2 lg:col-span-2">
              <Label>默认运行模式</Label>
              <div className="grid gap-2 md:grid-cols-3">
                {modeOptions.map((mode) => (
                  <button
                    type="button"
                    key={mode.id}
                    onClick={() => setForm({ ...form, mode: mode.id })}
                    className={`rounded-lg border px-3 py-3 text-left text-sm ${
                      form.mode === mode.id
                        ? "border-indigo-300 bg-indigo-50 text-indigo-950"
                        : "border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block font-medium">{mode.label || MODE_LABEL[mode.id] || mode.id}</span>
                    {mode.description ? <span className="mt-1 block text-xs leading-5 text-slate-500">{mode.description}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Button className="mt-5 gap-2 bg-indigo-600 hover:bg-indigo-700" disabled={!canWrite || saveBootMut.isPending} onClick={() => saveBootMut.mutate()}>
            {saveBootMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
            保存模板配置
          </Button>
        </section>
        </TabsContent>
      ) : null}
      </Tabs>

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
