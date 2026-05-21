import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, ChevronUp, Cpu, Database, HardDrive, Loader2, PlugZap, Plus, Power, RefreshCw, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import ComputeSetupPanel from "@/features/compute/components/ComputeSetupPanel";

export type PveView = "dashboard" | "targets" | "nodes" | "guests" | "storage" | "tasks";

type PVETarget = {
  id: string;
  name: string;
  baseUrl: string;
  authMethod?: string;
  username?: string;
  realm?: string;
  passwordSet?: boolean;
  passwordPreview?: string;
  tokenId?: string;
  tokenSecretSet?: boolean;
  tokenSecretPreview?: string;
  skipTls?: boolean;
  prometheusJob?: string;
  updatedAt?: string;
};

type PveTargetFormState = {
  name: string;
  baseUrl: string;
  authMethod: "password";
  username: string;
  password: string;
  prometheusJob: string;
  skipTls: boolean;
};

type PVEGuest = {
  id?: string;
  vmid?: number;
  name?: string;
  node?: string;
  type?: string;
  status?: string;
  cpu?: number;
  maxmem?: number;
  mem?: number;
  maxdisk?: number;
  disk?: number;
};

type PveRecord = Record<string, unknown>;

const pageMeta: Record<PveView, { title: string; desc: string; icon: typeof Server }> = {
  dashboard: {
    title: "PVE 总览",
    desc: "汇总当前 Proxmox VE 目标的节点、虚拟机与存储规模，快速进入常用操作。",
    icon: HardDrive,
  },
  targets: {
    title: "PVE 目标",
    desc: "维护 Proxmox VE 账号密码、Prometheus job 与 TLS 选项，并支持连通性探测。",
    icon: PlugZap,
  },
  nodes: {
    title: "PVE 节点",
    desc: "读取当前 PVE 目标的节点清单，查看节点状态、资源用量与运行时间。",
    icon: Server,
  },
  guests: {
    title: "PVE 虚拟机 / CT",
    desc: "按 PVE 资源接口列出虚拟机与容器，并保留已有基础电源操作。",
    icon: Cpu,
  },
  storage: {
    title: "PVE 存储",
    desc: "展示 PVE 集群资源中的存储条目、节点归属、类型、内容与容量使用。",
    icon: Database,
  },
  tasks: {
    title: "PVE 任务",
    desc: "查看 PVE 集群最近任务，便于跟踪电源操作、迁移与系统任务结果。",
    icon: Activity,
  },
};

function pveDataArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const d = (raw as { data?: unknown }).data;
    if (Array.isArray(d)) return d as T[];
  }
  return [];
}

function text(v: unknown): string {
  if (v == null || v === "") return "-";
  return String(v);
}

function numeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtBytes(v: unknown): string {
  const n = numeric(v);
  if (n == null || n <= 0) return "-";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TiB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

function fmtPercent(v: unknown): string {
  const n = numeric(v);
  if (n == null) return "-";
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(1)}%`;
}

function fmtUnixTime(v: unknown): string {
  const n = numeric(v);
  if (n == null || n <= 0) return text(v);
  return new Date(n * 1000).toLocaleString("zh-CN", { hour12: false });
}

function fmtDuration(v: unknown): string {
  const n = numeric(v);
  if (n == null || n <= 0) return "-";
  const days = Math.floor(n / 86400);
  const hours = Math.floor((n % 86400) / 3600);
  const minutes = Math.floor((n % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分`;
}

function fmtUpdatedAt(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function StatusBadge({ value }: { value: unknown }) {
  const s = String(value ?? "").toLowerCase();
  const ok = s === "online" || s === "running" || s === "ok" || s === "success" || s === "available";
  return <Badge variant={ok ? "default" : "outline"}>{text(value)}</Badge>;
}

function LoadingCell({ colSpan, label = "加载中..." }: { colSpan: number; label?: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-slate-500">
        {label}
      </TableCell>
    </TableRow>
  );
}

function EmptyCell({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-sm text-slate-500">
        {label}
      </TableCell>
    </TableRow>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function PveStats({
  nodes,
  guests,
  storage,
  tasks,
  loading,
}: {
  nodes: PveRecord[];
  guests: PVEGuest[];
  storage: PveRecord[];
  tasks?: PveRecord[];
  loading: boolean;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
      <MetricCard label="节点" value={loading ? "..." : nodes.length} />
      <MetricCard label="虚拟机 / CT" value={loading ? "..." : guests.length} />
      <MetricCard label="存储条目" value={loading ? "..." : storage.length} />
      {tasks ? <MetricCard label="最近任务" value={tasks.length} /> : null}
    </section>
  );
}

function PveWorkspace({ view }: { view: PveView }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.compute === "rw" || status?.permissions?.vcenter === "rw";
  const meta = pageMeta[view];
  const Icon = meta.icon;
  const [activeId, setActiveId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    name: "PVE",
    baseUrl: "",
    authMethod: "password" as const,
    username: "root",
    password: "",
    prometheusJob: "",
    skipTls: true,
  });

  const targetsQ = useQuery({
    queryKey: ["pve-targets"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
  });

  const pveTargets = useMemo(() => targetsQ.data?.targets ?? [], [targetsQ.data?.targets]);
  const pveTargetsInitialLoading = targetsQ.isLoading && !targetsQ.data;
  const pveNeedsSetup = !pveTargetsInitialLoading && pveTargets.length === 0;

  useEffect(() => {
    if (!activeId && pveTargets.length > 0) setActiveId(pveTargets[0].id);
  }, [activeId, pveTargets]);

  const active = useMemo(
    () => pveTargets.find((x) => x.id === activeId),
    [activeId, pveTargets]
  );

  const summaryQ = useQuery({
    queryKey: ["pve-summary", activeId],
    queryFn: ({ signal }) => apiGetJson<{ nodes: unknown; guests: unknown; storage: unknown }>(`/api/pve/targets/${activeId}/summary`, { signal }),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 30_000 : false,
  });

  const nodesQ = useQuery({
    queryKey: ["pve-nodes", activeId],
    queryFn: ({ signal }) => apiGetJson<{ nodes: unknown }>(`/api/pve/targets/${activeId}/nodes`, { signal }),
    enabled: Boolean(activeId && view === "nodes"),
    refetchInterval: activeId && view === "nodes" ? 30_000 : false,
  });

  const guestsQ = useQuery({
    queryKey: ["pve-guests", activeId],
    queryFn: ({ signal }) => apiGetJson<{ guests: unknown }>(`/api/pve/targets/${activeId}/guests`, { signal }),
    enabled: Boolean(activeId && view === "guests"),
    refetchInterval: activeId && view === "guests" ? 30_000 : false,
  });

  const storageQ = useQuery({
    queryKey: ["pve-storage", activeId],
    queryFn: ({ signal }) => apiGetJson<{ storage: unknown }>(`/api/pve/targets/${activeId}/storage`, { signal }),
    enabled: Boolean(activeId && view === "storage"),
    refetchInterval: activeId && view === "storage" ? 30_000 : false,
  });

  const tasksQ = useQuery({
    queryKey: ["pve-tasks", activeId],
    queryFn: ({ signal }) => apiGetJson<{ tasks: unknown }>(`/api/pve/targets/${activeId}/tasks`, { signal }),
    enabled: Boolean(activeId && view === "tasks"),
    refetchInterval: activeId && view === "tasks" ? 30_000 : false,
  });

  const summaryGuests = useMemo(() => pveDataArray<PVEGuest>(summaryQ.data?.guests), [summaryQ.data?.guests]);
  const summaryNodes = useMemo(() => pveDataArray<PveRecord>(summaryQ.data?.nodes), [summaryQ.data?.nodes]);
  const summaryStorage = useMemo(() => pveDataArray<PveRecord>(summaryQ.data?.storage), [summaryQ.data?.storage]);
  const nodes = useMemo(() => pveDataArray<PveRecord>(nodesQ.data?.nodes), [nodesQ.data?.nodes]);
  const guests = useMemo(() => pveDataArray<PVEGuest>(guestsQ.data?.guests), [guestsQ.data?.guests]);
  const storage = useMemo(() => pveDataArray<PveRecord>(storageQ.data?.storage), [storageQ.data?.storage]);
  const tasks = useMemo(() => pveDataArray<PveRecord>(tasksQ.data?.tasks), [tasksQ.data?.tasks]);

  const createMut = useMutation({
    mutationFn: () => apiPostJson<{ target: PVETarget }>("/api/pve/targets", form),
    onSuccess: (res) => {
      toast.success("PVE 目标已保存");
      setActiveId(res.target.id);
      setShowCreateForm(false);
      setForm((f) => ({ ...f, password: "" }));
      void qc.invalidateQueries({ queryKey: ["pve-targets"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/pve/targets/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("PVE 目标已删除");
      setActiveId("");
      void qc.invalidateQueries({ queryKey: ["pve-targets"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const probeMut = useMutation({
    mutationFn: (id: string) => apiPostJson<{ ok?: boolean; error?: string }>(`/api/pve/targets/${encodeURIComponent(id)}/probe`, {}),
    onSuccess: (res) => toast[res.ok ? "success" : "error"](res.ok ? "PVE API 连通" : res.error || "PVE API 探测失败"),
    onError: (e) => toast.error(String(e)),
  });

  const powerMut = useMutation({
    mutationFn: (body: { vmid: string; node: string; type: string; action: string }) =>
      apiPostJson(`/api/pve/targets/${encodeURIComponent(activeId)}/guests/${encodeURIComponent(body.vmid)}/power`, body),
    onSuccess: () => {
      toast.success("PVE 电源任务已提交");
      void qc.invalidateQueries({ queryKey: ["pve-summary", activeId] });
      void qc.invalidateQueries({ queryKey: ["pve-guests", activeId] });
      void qc.invalidateQueries({ queryKey: ["pve-tasks", activeId] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const refresh = () => {
    if (view === "nodes") void nodesQ.refetch();
    else if (view === "guests") void guestsQ.refetch();
    else if (view === "storage") void storageQ.refetch();
    else if (view === "tasks") void tasksQ.refetch();
    else if (view === "targets") void targetsQ.refetch();
    else void summaryQ.refetch();
  };

  const pageFetching =
    summaryQ.isFetching ||
    targetsQ.isFetching ||
    nodesQ.isFetching ||
    guestsQ.isFetching ||
    storageQ.isFetching ||
    tasksQ.isFetching;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Proxmox VE</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <Icon className="h-6 w-6 text-amber-600" />
              {meta.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{meta.desc}</p>
          </div>
          <Button variant="outline" className="w-fit gap-2" onClick={refresh} disabled={(view !== "targets" && !activeId) || pageFetching}>
            {pageFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </section>

      {pveTargetsInitialLoading ? (
        <PveTargetsLoadingPanel />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <TargetList
              targets={pveTargets}
              activeId={activeId}
              loading={targetsQ.isLoading}
              onSelect={setActiveId}
              canWrite={canWrite}
              createOpen={showCreateForm}
              onToggleCreate={() => setShowCreateForm((v) => !v)}
            />
            {showCreateForm ? (
              <TargetForm form={form} setForm={setForm} canWrite={canWrite} pending={createMut.isPending} onSubmit={() => createMut.mutate()} />
            ) : null}
            {!showCreateForm && pveNeedsSetup ? (
              <PveSetupPanel form={form} setForm={setForm} canWrite={canWrite} pending={createMut.isPending} onSubmit={() => createMut.mutate()} />
            ) : null}
          </aside>

          <main className="space-y-4">
            <PveStats
              nodes={summaryNodes}
              guests={summaryGuests}
              storage={summaryStorage}
              tasks={view === "tasks" ? tasks : undefined}
              loading={summaryQ.isLoading}
            />
            <CurrentTargetCard
              active={active}
              canWrite={canWrite}
              probePending={probeMut.isPending}
              deletePending={deleteMut.isPending}
              onProbe={(id) => probeMut.mutate(id)}
              onDelete={(id) => deleteMut.mutate(id)}
            />

            {view === "dashboard" ? (
              <PveDashboardPanel nodes={summaryNodes} guests={summaryGuests} storage={summaryStorage} loading={summaryQ.isLoading} />
            ) : null}
            {view === "targets" ? (
              <PveTargetsPanel
                targets={pveTargets}
                loading={targetsQ.isLoading}
                canWrite={canWrite}
                activeId={activeId}
                onSelect={setActiveId}
                onProbe={(id) => probeMut.mutate(id)}
                onDelete={(id) => deleteMut.mutate(id)}
                probePending={probeMut.isPending}
                deletePending={deleteMut.isPending}
              />
            ) : null}
            {view === "nodes" ? <PveNodesPanel rows={nodes} loading={nodesQ.isLoading} activeId={activeId} /> : null}
            {view === "guests" ? (
              <PveGuestsPanel
                rows={guests}
                loading={guestsQ.isLoading}
                canWrite={canWrite}
                activeId={activeId}
                powerPending={powerMut.isPending}
                onPower={(body) => powerMut.mutate(body)}
              />
            ) : null}
            {view === "storage" ? <PveStoragePanel rows={storage} loading={storageQ.isLoading} /> : null}
            {view === "tasks" ? <PveTasksPanel rows={tasks} loading={tasksQ.isLoading} /> : null}
          </main>
        </div>
      )}
    </div>
  );
}

function PveTargetsLoadingPanel() {
  return (
    <ComputeSetupPanel
      kind="pve"
      title="正在读取 PVE 目标"
      description="正在确认是否已有 Proxmox VE API 目标，完成后会显示目标工作区或新增表单。"
    >
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
        加载中...
      </div>
    </ComputeSetupPanel>
  );
}

function PveSetupPanel({
  form,
  setForm,
  canWrite,
  pending,
  onSubmit,
}: {
  form: PveTargetFormState;
  setForm: React.Dispatch<React.SetStateAction<PveTargetFormState>>;
  canWrite: boolean;
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <TargetForm
      form={form}
      setForm={setForm}
      canWrite={canWrite}
      pending={pending}
      onSubmit={onSubmit}
    />
  );
}

function TargetForm({
  form,
  setForm,
  canWrite,
  pending,
  onSubmit,
  embedded = false,
}: {
  form: PveTargetFormState;
  setForm: React.Dispatch<React.SetStateAction<PveTargetFormState>>;
  canWrite: boolean;
  pending: boolean;
  onSubmit: () => void;
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "rounded-lg border border-amber-100 bg-amber-50/40 p-4" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
      <h2 className="text-sm font-semibold text-slate-950">新增 PVE 目标</h2>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label>显示名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>API 地址</Label>
          <Input className="font-mono text-sm" placeholder="https://pve.example.com:8006" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>用户名</Label>
          <Input className="font-mono text-sm" placeholder="root" autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>密码</Label>
          <Input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Prometheus job（可选）</Label>
          <Input value={form.prometheusJob} onChange={(e) => setForm({ ...form, prometheusJob: e.target.value })} />
        </div>
        <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className="text-slate-700">跳过 TLS 校验</span>
          <Switch checked={form.skipTls} onCheckedChange={(v) => setForm({ ...form, skipTls: v })} />
        </label>
        <Button className="w-full gap-2 bg-amber-600 hover:bg-amber-700" disabled={!canWrite || pending} onClick={onSubmit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
          保存目标
        </Button>
      </div>
    </section>
  );
}

function TargetList({
  targets,
  activeId,
  loading,
  onSelect,
  canWrite,
  createOpen,
  onToggleCreate,
}: {
  targets: PVETarget[];
  activeId: string;
  loading: boolean;
  onSelect: (id: string) => void;
  canWrite: boolean;
  createOpen: boolean;
  onToggleCreate: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">已保存目标</h2>
        {canWrite ? (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" onClick={onToggleCreate}>
            {createOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {createOpen ? "收起" : "新增目标"}
          </Button>
        ) : null}
      </div>
      <div className="mt-3 space-y-2">
        {targets.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={`w-full rounded-lg border px-3 py-3 text-left transition ${activeId === t.id ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-950">{t.name}</span>
              <Badge variant={t.passwordSet || t.tokenSecretSet ? "secondary" : "outline"}>
                {t.passwordSet ? "密码已保存" : t.tokenSecretSet ? "Token 已保存" : "未保存"}
              </Badge>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-500">{t.baseUrl}</p>
            {t.username || t.tokenId ? <p className="mt-1 truncate font-mono text-xs text-slate-500">{t.username || t.tokenId}</p> : null}
          </button>
        ))}
        {loading ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">加载中...</p> : null}
        {!loading && targets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">还没有 PVE 目标</p>
        ) : null}
      </div>
    </section>
  );
}

function CurrentTargetCard({
  active,
  canWrite,
  probePending,
  deletePending,
  onProbe,
  onDelete,
}: {
  active?: PVETarget;
  canWrite: boolean;
  probePending: boolean;
  deletePending: boolean;
  onProbe: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">当前目标</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{active ? `${active.name} · ${active.baseUrl}` : "请选择或新增 PVE 目标"}</p>
        </div>
        {active ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onProbe(active.id)} disabled={!canWrite || probePending}>
              <ShieldCheck className="h-4 w-4" />
              探测
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => onDelete(active.id)} disabled={!canWrite || deletePending}>
              <Trash2 className="h-4 w-4" />
              删除
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PveDashboardPanel({ nodes, guests, storage, loading }: { nodes: PveRecord[]; guests: PVEGuest[]; storage: PveRecord[]; loading: boolean }) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-950">节点概况</h2>
        <div className="overflow-auto rounded-lg border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>节点</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>CPU</TableHead>
                <TableHead>内存</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <LoadingCell colSpan={4} /> : null}
              {!loading && nodes.length === 0 ? <EmptyCell colSpan={4} label="暂无 PVE 节点数据" /> : null}
              {!loading
                ? nodes.slice(0, 6).map((row) => (
                    <TableRow key={text(row.node ?? row.name)}>
                      <TableCell className="font-mono text-xs">{text(row.node ?? row.name)}</TableCell>
                      <TableCell><StatusBadge value={row.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{fmtPercent(row.cpu)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(row.mem)} / {fmtBytes(row.maxmem)}</TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-950">虚拟机与存储摘要</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">运行中虚拟机 / CT</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{guests.filter((g) => g.status === "running").length}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">在线存储</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{storage.filter((s) => String(s.status ?? "").toLowerCase() === "available").length || storage.length}</p>
          </div>
        </div>
        <div className="mt-4 overflow-auto rounded-lg border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>节点</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <LoadingCell colSpan={3} /> : null}
              {!loading && guests.length === 0 ? <EmptyCell colSpan={3} label="暂无 PVE 虚拟机数据" /> : null}
              {!loading
                ? guests.slice(0, 6).map((g) => (
                    <TableRow key={`${g.node ?? "-"}-${g.vmid ?? g.id ?? g.name}`}>
                      <TableCell className="font-medium">{g.name || g.vmid || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{g.node || "-"}</TableCell>
                      <TableCell><StatusBadge value={g.status} /></TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

function PveTargetsPanel({
  targets,
  loading,
  canWrite,
  activeId,
  onSelect,
  onProbe,
  onDelete,
  probePending,
  deletePending,
}: {
  targets: PVETarget[];
  loading: boolean;
  canWrite: boolean;
  activeId: string;
  onSelect: (id: string) => void;
  onProbe: (id: string) => void;
  onDelete: (id: string) => void;
  probePending: boolean;
  deletePending: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">目标明细</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>API 地址</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>Prometheus job</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={6} /> : null}
            {!loading && targets.length === 0 ? <EmptyCell colSpan={6} label="还没有 PVE 目标" /> : null}
            {!loading
              ? targets.map((t) => (
                  <TableRow key={t.id} className={activeId === t.id ? "bg-amber-50/60" : undefined}>
                    <TableCell>
                      <button type="button" onClick={() => onSelect(t.id)} className="text-left font-medium text-slate-950 hover:text-amber-700">
                        {t.name}
                      </button>
                    </TableCell>
                    <TableCell className="min-w-64 font-mono text-xs">{t.baseUrl}</TableCell>
                    <TableCell className="font-mono text-xs">
                      <div className="flex flex-col gap-1">
                        <span>{t.username || t.tokenId || "-"}</span>
                        <Badge className="w-fit" variant={t.passwordSet || t.tokenSecretSet ? "secondary" : "outline"}>
                          {t.passwordSet ? t.passwordPreview || "密码已保存" : t.tokenSecretSet ? t.tokenSecretPreview || "Token 已保存" : "未保存"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.prometheusJob || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtUpdatedAt(t.updatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" disabled={!canWrite || probePending} onClick={() => onProbe(t.id)}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          探测
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-red-700" disabled={!canWrite || deletePending} onClick={() => onDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveNodesPanel({ rows, loading, activeId }: { rows: PveRecord[]; loading: boolean; activeId: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">节点列表</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>节点</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>内存</TableHead>
              <TableHead>磁盘</TableHead>
              <TableHead>运行时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={6} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={6} label="暂无 PVE 节点数据" /> : null}
            {!loading
              ? rows.map((row) => (
                    <TableRow key={text(row.node ?? row.name)}>
                      <TableCell className="font-mono text-xs">
                        {activeId && text(row.node ?? row.name) !== "-" ? (
                          <Link
                            className="font-medium text-amber-700 hover:underline"
                            to={`/cluster/compute/pve/nodes/${encodeURIComponent(activeId)}/${encodeURIComponent(text(row.node ?? row.name))}`}
                          >
                            {text(row.node ?? row.name)}
                          </Link>
                        ) : (
                          text(row.node ?? row.name)
                        )}
                      </TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="font-mono text-xs">{fmtPercent(row.cpu)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtBytes(row.mem)} / {fmtBytes(row.maxmem)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtBytes(row.disk)} / {fmtBytes(row.maxdisk)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtDuration(row.uptime)}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveGuestsPanel({
  rows,
  loading,
  canWrite,
  activeId,
  powerPending,
  onPower,
}: {
  rows: PVEGuest[];
  loading: boolean;
  canWrite: boolean;
  activeId: string;
  powerPending: boolean;
  onPower: (body: { vmid: string; node: string; type: string; action: string }) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">虚拟机与容器</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>VMID</TableHead>
              <TableHead>节点</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>内存</TableHead>
              <TableHead>磁盘</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={8} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={8} label="暂无 PVE 虚拟机数据" /> : null}
            {!loading
              ? rows.map((g) => {
                  const vmid = String(g.vmid ?? g.id ?? "");
                  const node = String(g.node ?? "");
                  const type = String(g.type ?? "qemu");
                  return (
                    <TableRow key={`${node}-${vmid}`}>
                      <TableCell className="font-medium">
                        {activeId && vmid && node ? (
                          <Link
                            className="text-amber-700 hover:underline"
                            to={`/cluster/compute/pve/guests/${encodeURIComponent(activeId)}/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}`}
                          >
                            {g.name || vmid}
                          </Link>
                        ) : (
                          g.name || vmid
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{vmid || "-"}</TableCell>
                      <TableCell className="font-mono text-xs">{node || "-"}</TableCell>
                      <TableCell>{type}</TableCell>
                      <TableCell><StatusBadge value={g.status} /></TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(g.mem)} / {fmtBytes(g.maxmem)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(g.disk)} / {fmtBytes(g.maxdisk)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {["start", "shutdown", "reboot", "stop"].map((action) => (
                            <Button
                              key={action}
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2"
                              disabled={!canWrite || !activeId || !vmid || !node || powerPending}
                              onClick={() => onPower({ vmid, node, type, action })}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {action}
                            </Button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveStoragePanel({ rows, loading }: { rows: PveRecord[]; loading: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">存储列表</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>存储</TableHead>
              <TableHead>节点</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>内容</TableHead>
              <TableHead>容量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={6} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={6} label="暂无 PVE 存储数据" /> : null}
            {!loading
              ? rows.map((row) => (
                  <TableRow key={`${text(row.node)}-${text(row.storage ?? row.name)}`}>
                    <TableCell className="font-medium">{text(row.storage ?? row.name)}</TableCell>
                    <TableCell className="font-mono text-xs">{text(row.node)}</TableCell>
                    <TableCell>{text(row.type ?? row.plugintype)}</TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell className="max-w-sm truncate text-xs">{text(row.content)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtBytes(row.disk)} / {fmtBytes(row.maxdisk)}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveTasksPanel({ rows, loading }: { rows: PveRecord[]; loading: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">最近任务</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>任务</TableHead>
              <TableHead>节点</TableHead>
              <TableHead>类型</TableHead>
              <TableHead>用户</TableHead>
              <TableHead>开始</TableHead>
              <TableHead>结束</TableHead>
              <TableHead>状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={7} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={7} label="暂无 PVE 任务数据" /> : null}
            {!loading
              ? rows.map((row) => (
                  <TableRow key={text(row.upid ?? row.id ?? `${row.node}-${row.starttime}-${row.type}`)}>
                    <TableCell className="max-w-[22rem] truncate font-mono text-xs">{text(row.upid ?? row.id)}</TableCell>
                    <TableCell className="font-mono text-xs">{text(row.node)}</TableCell>
                    <TableCell>{text(row.type)}</TableCell>
                    <TableCell className="font-mono text-xs">{text(row.user)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtUnixTime(row.starttime)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtUnixTime(row.endtime)}</TableCell>
                    <TableCell><StatusBadge value={row.status ?? row.exitstatus} /></TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default PveWorkspace;
