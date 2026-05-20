import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PlugZap, Power, RefreshCw, Server, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";

type PVETarget = {
  id: string;
  name: string;
  baseUrl: string;
  tokenId: string;
  tokenSecretSet?: boolean;
  tokenSecretPreview?: string;
  skipTls?: boolean;
  prometheusJob?: string;
  updatedAt?: string;
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

function pveDataArray<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object") {
    const d = (raw as { data?: unknown }).data;
    if (Array.isArray(d)) return d as T[];
  }
  return [];
}

function fmtBytes(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

const PVEPage: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin";
  const [activeId, setActiveId] = useState("");
  const [form, setForm] = useState({
    name: "PVE",
    baseUrl: "",
    tokenId: "",
    tokenSecret: "",
    prometheusJob: "",
    skipTls: true,
  });

  const targetsQ = useQuery({
    queryKey: ["pve-targets"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
  });

  useEffect(() => {
    const rows = targetsQ.data?.targets ?? [];
    if (!activeId && rows.length > 0) setActiveId(rows[0].id);
  }, [activeId, targetsQ.data?.targets]);

  const active = useMemo(
    () => (targetsQ.data?.targets ?? []).find((x) => x.id === activeId),
    [activeId, targetsQ.data?.targets]
  );

  const summaryQ = useQuery({
    queryKey: ["pve-summary", activeId],
    queryFn: ({ signal }) => apiGetJson<{ nodes: unknown; guests: unknown; storage: unknown }>(`/api/pve/targets/${activeId}/summary`, { signal }),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 30_000 : false,
  });

  const guests = useMemo(() => pveDataArray<PVEGuest>(summaryQ.data?.guests), [summaryQ.data?.guests]);
  const nodes = useMemo(() => pveDataArray<Record<string, unknown>>(summaryQ.data?.nodes), [summaryQ.data?.nodes]);
  const storage = useMemo(() => pveDataArray<Record<string, unknown>>(summaryQ.data?.storage), [summaryQ.data?.storage]);

  const createMut = useMutation({
    mutationFn: () => apiPostJson<{ target: PVETarget }>("/api/pve/targets", form),
    onSuccess: (res) => {
      toast.success("PVE 目标已保存");
      setActiveId(res.target.id);
      setForm((f) => ({ ...f, tokenSecret: "" }));
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
    },
    onError: (e) => toast.error(String(e)),
  });

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Proxmox VE</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <Server className="h-6 w-6 text-amber-600" />
              PVE 纳管
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              使用 PVE API Token 保存多个 Proxmox 集群入口，列表展示节点、虚拟机、存储与基础电源操作。
            </p>
          </div>
          <Button variant="outline" className="w-fit gap-2" onClick={() => summaryQ.refetch()} disabled={!activeId || summaryQ.isFetching}>
            {summaryQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
                <Label>Token ID</Label>
                <Input className="font-mono text-sm" placeholder="root@pam!kubebt" value={form.tokenId} onChange={(e) => setForm({ ...form, tokenId: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Token Secret</Label>
                <Input type="password" autoComplete="off" value={form.tokenSecret} onChange={(e) => setForm({ ...form, tokenSecret: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Prometheus job（可选）</Label>
                <Input value={form.prometheusJob} onChange={(e) => setForm({ ...form, prometheusJob: e.target.value })} />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700">跳过 TLS 校验</span>
                <Switch checked={form.skipTls} onCheckedChange={(v) => setForm({ ...form, skipTls: v })} />
              </label>
              <Button className="w-full gap-2 bg-amber-600 hover:bg-amber-700" disabled={!canWrite || createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                保存目标
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">已保存目标</h2>
            <div className="mt-3 space-y-2">
              {(targetsQ.data?.targets ?? []).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${activeId === t.id ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-950">{t.name}</span>
                    <Badge variant={t.tokenSecretSet ? "secondary" : "outline"}>{t.tokenSecretSet ? "Token 已保存" : "无 Token"}</Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">{t.baseUrl}</p>
                </button>
              ))}
              {targetsQ.isSuccess && (targetsQ.data?.targets.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  还没有 PVE 目标
                </p>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">节点</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{nodes.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">虚拟机 / CT</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{guests.length}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">存储条目</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{storage.length}</p>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">当前目标</h2>
                <p className="mt-1 font-mono text-xs text-slate-500">{active ? `${active.name} · ${active.baseUrl}` : "请选择或新增 PVE 目标"}</p>
              </div>
              {active ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => probeMut.mutate(active.id)} disabled={!canWrite || probeMut.isPending}>
                    <ShieldCheck className="h-4 w-4" />
                    探测
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => deleteMut.mutate(active.id)} disabled={!canWrite || deleteMut.isPending}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-950">虚拟机与容器</h2>
            <div className="overflow-auto rounded-lg border border-slate-100">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>节点</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>内存</TableHead>
                    <TableHead>磁盘</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryQ.isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">加载中…</TableCell>
                    </TableRow>
                  ) : guests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">暂无 PVE 虚拟机数据</TableCell>
                    </TableRow>
                  ) : guests.map((g) => {
                    const vmid = String(g.vmid ?? g.id ?? "");
                    const node = String(g.node ?? "");
                    const type = String(g.type ?? "qemu");
                    return (
                      <TableRow key={`${node}-${vmid}`}>
                        <TableCell className="font-medium">{g.name || vmid}</TableCell>
                        <TableCell className="font-mono text-xs">{node || "-"}</TableCell>
                        <TableCell>{type}</TableCell>
                        <TableCell>
                          <Badge variant={g.status === "running" ? "default" : "outline"}>{g.status || "-"}</Badge>
                        </TableCell>
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
                                disabled={!canWrite || !activeId || !vmid || !node || powerMut.isPending}
                                onClick={() => powerMut.mutate({ vmid, node, type, action })}
                              >
                                <Power className="h-3.5 w-3.5" />
                                {action}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default PVEPage;
