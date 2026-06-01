import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cpu, Database, HardDrive, Loader2, PlugZap, Power, RefreshCw, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import ComputeSetupPanel from "@/features/compute/components/ComputeSetupPanel";
import InfraMetricTile from "@/shared/ui/InfraMetricTile";
import PveTargetForm, {
  defaultPveTargetForm,
  type PVETarget,
  type PveTargetFormState,
} from "@/features/compute/pve/components/PveTargetForm";
import { withPveMutationConfirm, withPveMutationConfirmQuery } from "@/features/compute/pve/lib/pveMutationConfirm";
import { singlePveTarget } from "./pveSingleton";

export type PveView = "dashboard" | "targets" | "nodes" | "guests" | "storage" | "tasks";

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
    title: "PVE 配置",
    desc: "维护 Proxmox VE 账号密码、Prometheus job 与 TLS 选项。",
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
      <InfraMetricTile label="节点" value={loading ? "..." : nodes.length} />
      <InfraMetricTile label="虚拟机 / CT" value={loading ? "..." : guests.length} />
      <InfraMetricTile label="存储条目" value={loading ? "..." : storage.length} />
      {tasks ? <InfraMetricTile label="最近任务" value={tasks.length} /> : null}
    </section>
  );
}

function PveWorkspace({ view }: { view: PveView }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.compute === "rw" || status?.permissions?.vcenter === "rw";
  const meta = pageMeta[view];
  const Icon = meta.icon;
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState<PveTargetFormState>(() => ({ ...defaultPveTargetForm }));

  const targetsQ = useQuery({
    queryKey: ["pve-targets"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
  });

  const pveTargets = useMemo(() => targetsQ.data?.targets ?? [], [targetsQ.data?.targets]);
  const pveTargetsInitialLoading = targetsQ.isLoading && !targetsQ.data;
  const pveNeedsSetup = !pveTargetsInitialLoading && pveTargets.length === 0;
  const active = useMemo(() => singlePveTarget(pveTargets), [pveTargets]);
  const activeId = active?.id ?? "";

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
    mutationFn: () => apiPostJson<{ target: PVETarget }>("/api/pve/targets", withPveMutationConfirm(form)),
    onSuccess: () => {
      toast.success("PVE 目标已保存");
      setShowCreateForm(false);
      setForm((f) => ({ ...f, password: "" }));
      void qc.invalidateQueries({ queryKey: ["pve-targets"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(withPveMutationConfirmQuery(`/api/pve/targets/${encodeURIComponent(id)}`)),
    onSuccess: () => {
      toast.success("PVE 目标已删除");
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
      apiPostJson(`/api/pve/targets/${encodeURIComponent(activeId)}/guests/${encodeURIComponent(body.vmid)}/power`, withPveMutationConfirm(body)),
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

  const renderPveTargetForm = () => (
    <PveTargetForm form={form} setForm={setForm} canWrite={canWrite} pending={createMut.isPending} onSubmit={() => createMut.mutate()} />
  );
  const pveTargetForm = showCreateForm ? (
    renderPveTargetForm()
  ) : pveNeedsSetup ? (
    renderPveTargetForm()
  ) : null;

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
        <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <PveInstancePanel
              target={active}
              canWrite={canWrite}
              configOpen={showCreateForm || pveNeedsSetup}
              onToggleConfig={() => setShowCreateForm((v) => !v)}
              probePending={probeMut.isPending}
              deletePending={deleteMut.isPending}
              onProbe={(id) => probeMut.mutate(id)}
              onDelete={(id) => deleteMut.mutate(id)}
            />
            {pveTargetForm}
          </aside>

          <main className="space-y-4">
            <PveStats
              nodes={summaryNodes}
              guests={summaryGuests}
              storage={summaryStorage}
              tasks={view === "tasks" ? tasks : undefined}
              loading={summaryQ.isLoading}
            />
            {view === "dashboard" ? (
              <PveDashboardPanel nodes={summaryNodes} guests={summaryGuests} storage={summaryStorage} loading={summaryQ.isLoading} />
            ) : null}
            {view === "targets" ? (
              <PveConfigurationPanel target={active} loading={targetsQ.isLoading} />
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

function PveInstancePanel({
  target,
  canWrite,
  configOpen,
  probePending,
  deletePending,
  onToggleConfig,
  onProbe,
  onDelete,
}: {
  target?: PVETarget;
  canWrite: boolean;
  configOpen: boolean;
  probePending: boolean;
  deletePending: boolean;
  onToggleConfig: () => void;
  onProbe: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">PVE Instance</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950">{target?.name || "未配置 PVE"}</h2>
          <p className="mt-1 font-mono text-xs text-slate-500">{target?.baseUrl || "配置 Proxmox VE API 地址"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggleConfig} disabled={!canWrite}>
            <PlugZap className="h-4 w-4" />
            {configOpen ? "收起配置" : target ? "更新 PVE" : "配置 PVE"}
          </Button>
        {target ? (
          <>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onProbe(target.id)} disabled={!canWrite || probePending}>
              <ShieldCheck className="h-4 w-4" />
              探测
            </Button>
            <ConfirmActionButton
              variant="outline"
              size="sm"
              className="gap-1.5 text-red-700"
              disabled={!canWrite || deletePending}
              title="确认删除 PVE 目标？"
              description={`将从平台配置中移除「${target.name || target.id}」PVE 连接目标。`}
              confirmLabel="删除"
              confirmButtonClassName="bg-red-600 text-white hover:bg-red-700"
              onConfirm={() => onDelete(target.id)}
            >
              <Trash2 className="h-4 w-4" />
              删除
            </ConfirmActionButton>
          </>
        ) : null}
        </div>
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

function PveConfigurationPanel({ target, loading }: { target?: PVETarget; loading: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">PVE 配置</h2>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">加载中...</p>
      ) : target ? (
        <div className="overflow-auto rounded-lg border border-slate-100">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>字段</TableHead>
                <TableHead>值</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["名称", target.name],
                ["API 地址", target.baseUrl],
                ["账号", target.username || target.tokenId || "-"],
                ["Prometheus job", target.prometheusJob || "-"],
                ["更新时间", fmtUpdatedAt(target.updatedAt)],
              ].map(([label, value]) => (
                <TableRow key={label}>
                  <TableCell className="w-44 text-slate-500">{label}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          还没有配置 PVE，请在左侧保存唯一的 PVE 实例。
        </div>
      )}
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
                            <ConfirmActionButton
                              key={action}
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 px-2"
                              disabled={!canWrite || !activeId || !vmid || !node || powerPending}
                              title="确认执行 PVE 电源操作？"
                              description={`将对 ${type} ${node}/${vmid} 执行 ${action} 操作。`}
                              confirmLabel="执行"
                              onConfirm={() => onPower({ vmid, node, type, action })}
                            >
                              <Power className="h-3.5 w-3.5" />
                              {action}
                            </ConfirmActionButton>
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
