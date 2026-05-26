import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw, Server } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiGetJson } from "@/lib/api";

type PveNodeEnvelope = {
  target?: string;
  node?: string;
  status?: Record<string, unknown>;
  version?: Record<string, unknown>;
  warnings?: string[];
};

type PveMetricsEnvelope = { metrics?: unknown };
type PveListEnvelope = { guests?: unknown; storage?: unknown; tasks?: unknown };

function asRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

function valueText(v: unknown): string {
  if (v == null || v === "") return "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function fmtPercent(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
}

function fmtBytes(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TiB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

function KeyValueTable({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v != null && v !== "");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">{title}</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow><TableCell className="py-8 text-center text-sm text-slate-500">暂无数据</TableCell></TableRow>
            ) : (
              entries.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="w-52 font-mono text-xs text-slate-500">{k}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-900">{valueText(v)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">{label}</TableCell>
    </TableRow>
  );
}

export default function PveNodeDetail() {
  const { targetId = "", node = "" } = useParams();
  const detailPath = `/api/pve/targets/${encodeURIComponent(targetId)}/nodes/${encodeURIComponent(node)}`;
  const metricsPath = `/api/pve/targets/${encodeURIComponent(targetId)}/nodes/${encodeURIComponent(node)}/metrics?timeframe=hour`;

  const detailQ = useQuery({
    queryKey: ["pve-node-detail", targetId, node],
    queryFn: ({ signal }) => apiGetJson<PveNodeEnvelope>(detailPath, { signal }),
    enabled: Boolean(targetId && node),
    refetchInterval: 30_000,
  });

  const metricsQ = useQuery({
    queryKey: ["pve-node-metrics", targetId, node],
    queryFn: ({ signal }) => apiGetJson<PveMetricsEnvelope>(metricsPath, { signal }),
    enabled: Boolean(targetId && node),
    refetchInterval: 30_000,
  });

  const guestsQ = useQuery({
    queryKey: ["pve-guests", targetId],
    queryFn: ({ signal }) => apiGetJson<PveListEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/guests`, { signal }),
    enabled: Boolean(targetId && node),
    refetchInterval: 30_000,
  });

  const storageQ = useQuery({
    queryKey: ["pve-storage", targetId],
    queryFn: ({ signal }) => apiGetJson<PveListEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/storage`, { signal }),
    enabled: Boolean(targetId && node),
    refetchInterval: 30_000,
  });

  const tasksQ = useQuery({
    queryKey: ["pve-tasks", targetId],
    queryFn: ({ signal }) => apiGetJson<PveListEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/tasks`, { signal }),
    enabled: Boolean(targetId && node),
    refetchInterval: 30_000,
  });

  const status = detailQ.data?.status ?? {};
  const version = detailQ.data?.version ?? {};
  const memory = status.memory && typeof status.memory === "object" ? (status.memory as Record<string, unknown>) : {};
  const metricRows = useMemo(() => asRows(metricsQ.data?.metrics), [metricsQ.data?.metrics]);
  const guests = useMemo(() => asRows(guestsQ.data?.guests).filter((row) => String(row.node ?? "") === node), [guestsQ.data?.guests, node]);
  const storage = useMemo(() => asRows(storageQ.data?.storage).filter((row) => String(row.node ?? "") === node), [storageQ.data?.storage, node]);
  const tasks = useMemo(() => asRows(tasksQ.data?.tasks).filter((row) => String(row.node ?? "") === node), [tasksQ.data?.tasks, node]);
  const loading = detailQ.isLoading || metricsQ.isLoading;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link to="/cluster/compute/pve/nodes" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-700">
              <ArrowLeft className="h-3.5 w-3.5" />
              返回 PVE 节点
            </Link>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <Server className="h-6 w-6 text-amber-600" />
              {node}
            </h1>
            <p className="mt-2 font-mono text-sm text-slate-500">{targetId}</p>
          </div>
          <Button variant="outline" className="w-fit gap-2" onClick={() => { void detailQ.refetch(); void metricsQ.refetch(); void guestsQ.refetch(); void storageQ.refetch(); void tasksQ.refetch(); }} disabled={detailQ.isFetching || metricsQ.isFetching}>
            {detailQ.isFetching || metricsQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </section>

      {detailQ.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{String(detailQ.error)}</div> : null}
      {detailQ.data?.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{detailQ.data.warnings.join("；")}</div>
      ) : null}

      <Tabs defaultValue="overview" className="w-full space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="metrics">性能</TabsTrigger>
          <TabsTrigger value="guests">Guest</TabsTrigger>
          <TabsTrigger value="storage">存储</TabsTrigger>
          <TabsTrigger value="tasks">任务</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">状态</p>
              <div className="mt-2"><Badge>{valueText(status.status)}</Badge></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">CPU</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{fmtPercent(status.cpu)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">内存</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{fmtBytes(memory.used ?? status.mem)} / {fmtBytes(memory.total ?? status.maxmem)}</p>
            </div>
          </section>
          {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div> : null}
          <section className="grid gap-4 xl:grid-cols-2">
            <KeyValueTable title="节点状态" data={status} />
            <KeyValueTable title="版本信息" data={version} />
          </section>
        </TabsContent>

        <TabsContent value="metrics">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-950">最近性能</h2>
            <div className="overflow-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>CPU</TableHead>
                    <TableHead>内存</TableHead>
                    <TableHead>负载</TableHead>
                    <TableHead>网络入</TableHead>
                    <TableHead>网络出</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricRows.length === 0 ? <EmptyRow colSpan={6} label="暂无性能数据" /> : null}
                  {metricRows.slice(-24).map((row, idx) => (
                    <TableRow key={`${valueText(row.time)}-${idx}`}>
                      <TableCell className="font-mono text-xs">{valueText(row.time)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtPercent(row.cpu)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(row.memused ?? row.mem)}</TableCell>
                      <TableCell className="font-mono text-xs">{valueText(row.loadavg ?? row.load)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(row.netin)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(row.netout)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="guests">
          <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>VMID</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>内存</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {guestsQ.isLoading ? <EmptyRow colSpan={5} label="加载中..." /> : null}
                {!guestsQ.isLoading && guests.length === 0 ? <EmptyRow colSpan={5} label="暂无 Guest" /> : null}
                {!guestsQ.isLoading ? guests.map((row) => {
                  const vmid = String(row.vmid ?? row.id ?? "");
                  const type = String(row.type ?? "qemu");
                  return (
                    <TableRow key={`${type}-${vmid}`}>
                      <TableCell className="font-medium">
                        <Link className="text-amber-700 hover:underline" to={`/cluster/compute/pve/guests/${encodeURIComponent(targetId)}/${encodeURIComponent(node)}/${encodeURIComponent(type)}/${encodeURIComponent(vmid)}`}>
                          {valueText(row.name ?? vmid)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{vmid}</TableCell>
                      <TableCell>{type}</TableCell>
                      <TableCell><Badge variant={String(row.status).toLowerCase() === "running" ? "default" : "outline"}>{valueText(row.status)}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{fmtBytes(row.mem)} / {fmtBytes(row.maxmem)}</TableCell>
                    </TableRow>
                  );
                }) : null}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="storage">
          <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>存储</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>内容</TableHead>
                  <TableHead>容量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storageQ.isLoading ? <EmptyRow colSpan={4} label="加载中..." /> : null}
                {!storageQ.isLoading && storage.length === 0 ? <EmptyRow colSpan={4} label="暂无存储" /> : null}
                {!storageQ.isLoading ? storage.map((row) => (
                  <TableRow key={valueText(row.storage ?? row.name)}>
                    <TableCell className="font-medium">{valueText(row.storage ?? row.name)}</TableCell>
                    <TableCell>{valueText(row.type ?? row.plugintype)}</TableCell>
                    <TableCell className="max-w-lg truncate text-xs">{valueText(row.content)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtBytes(row.disk)} / {fmtBytes(row.maxdisk)}</TableCell>
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="tasks">
          <section className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>任务</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>用户</TableHead>
                  <TableHead>状态</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasksQ.isLoading ? <EmptyRow colSpan={4} label="加载中..." /> : null}
                {!tasksQ.isLoading && tasks.length === 0 ? <EmptyRow colSpan={4} label="暂无任务" /> : null}
                {!tasksQ.isLoading ? tasks.slice(0, 80).map((row) => (
                  <TableRow key={valueText(row.upid ?? `${row.type}-${row.starttime}`)}>
                    <TableCell className="max-w-[32rem] truncate font-mono text-xs">{valueText(row.upid ?? row.id)}</TableCell>
                    <TableCell>{valueText(row.type)}</TableCell>
                    <TableCell className="font-mono text-xs">{valueText(row.user)}</TableCell>
                    <TableCell><Badge variant={String(row.status ?? row.exitstatus).toUpperCase() === "OK" ? "default" : "outline"}>{valueText(row.status ?? row.exitstatus)}</Badge></TableCell>
                  </TableRow>
                )) : null}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
