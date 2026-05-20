import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Network, Plus, RadioTower, RefreshCw, Router, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";

type NetworkKind = "ikuai" | "openwrt";

type NetworkDevice = {
  id: string;
  kind: NetworkKind;
  name: string;
  prometheusScope: string;
  instanceLabel?: string;
  jobLabel?: string;
  notes?: string;
  updatedAt?: string;
};

type OpenWrtFamilies = {
  system?: boolean;
  interfaces?: boolean;
  dhcp?: boolean;
  wifi?: boolean;
  netstat?: boolean;
};

type OpenWrtStatus = {
  prometheusConfigured?: boolean;
  families?: OpenWrtFamilies;
  missingHints?: string[];
  metricNames?: string[];
  note?: string;
};

const familyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

const NetworkDashboard: React.FC = () => {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const preferredKind = params.get("kind") === "openwrt" ? "openwrt" : "";
  const [activeId, setActiveId] = useState("");
  const [form, setForm] = useState({
    kind: (preferredKind || "ikuai") as NetworkKind,
    name: "",
    prometheusScope: "network",
    instanceLabel: "",
    jobLabel: "",
    notes: "",
  });

  useEffect(() => {
    if (preferredKind) setForm((f) => ({ ...f, kind: preferredKind as NetworkKind }));
  }, [preferredKind]);

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  useEffect(() => {
    const rows = devicesQ.data?.devices ?? [];
    if (!activeId && rows.length > 0) setActiveId(rows[0].id);
  }, [activeId, devicesQ.data?.devices]);

  const active = useMemo(
    () => (devicesQ.data?.devices ?? []).find((x) => x.id === activeId),
    [activeId, devicesQ.data?.devices]
  );

  const statusQ = useQuery({
    queryKey: ["network-device-exporter-status", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtStatus>(`/api/network/devices/${activeId}/exporter-status`, { signal }),
    enabled: Boolean(activeId && active?.kind === "openwrt"),
    refetchInterval: active?.kind === "openwrt" ? 60_000 : false,
  });

  const overviewQ = useQuery({
    queryKey: ["network-device-overview", activeId],
    queryFn: ({ signal }) => apiGetJson<Record<string, unknown>>(`/api/network/devices/${activeId}/overview`, { signal }),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 60_000 : false,
  });

  const createMut = useMutation({
    mutationFn: () => apiPostJson<{ device: NetworkDevice }>("/api/network/devices", form),
    onSuccess: (res) => {
      toast.success("网络设备已保存");
      setActiveId(res.device.id);
      setForm((f) => ({ ...f, name: "", instanceLabel: "", jobLabel: "", notes: "" }));
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("网络设备已删除");
      setActiveId("");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const ikuaiCount = (devicesQ.data?.devices ?? []).filter((x) => x.kind === "ikuai").length;
  const openwrtCount = (devicesQ.data?.devices ?? []).filter((x) => x.kind === "openwrt").length;
  const families = statusQ.data?.families ?? {};
  const familyReadyCount = familyLabels.filter(([k]) => Boolean(families[k])).length;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">网络设备</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Network className="h-6 w-6 text-cyan-600" />
              iKuai 与 OpenWrt
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              iKuai 继续使用现有 Prometheus 图表能力，OpenWrt 先按 node/openwrt 指标族探测系统、接口、DHCP、Wi-Fi 与连接指标。
            </p>
          </div>
          <Button asChild className="w-fit gap-2 bg-cyan-600 hover:bg-cyan-700">
            <Link to="/cluster/network/ikuai">
              iKuai 图表
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">纳管设备</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{devicesQ.data?.devices.length ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">iKuai</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{ikuaiCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">OpenWrt</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{openwrtCount}</p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">新增网络设备</h2>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label>设备类型</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(["ikuai", "openwrt"] as NetworkKind[]).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setForm({ ...form, kind })}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${form.kind === kind ? "border-cyan-300 bg-cyan-50 text-cyan-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      {kind === "ikuai" ? <Router className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
                      {kind === "ikuai" ? "iKuai" : "OpenWrt"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>显示名称</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.kind === "ikuai" ? "主路由 iKuai" : "旁路由 OpenWrt"} />
              </div>
              <div className="space-y-1.5">
                <Label>Prometheus scope</Label>
                <Input value={form.prometheusScope} onChange={(e) => setForm({ ...form, prometheusScope: e.target.value })} placeholder="network / vcenter / default" />
              </div>
              <div className="space-y-1.5">
                <Label>instance 标签</Label>
                <Input className="font-mono text-sm" value={form.instanceLabel} onChange={(e) => setForm({ ...form, instanceLabel: e.target.value })} placeholder="192.168.1.1:9100" />
              </div>
              <div className="space-y-1.5">
                <Label>job 标签（可选）</Label>
                <Input value={form.jobLabel} onChange={(e) => setForm({ ...form, jobLabel: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700" disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                保存设备
              </Button>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">设备列表</h2>
            <div className="mt-3 space-y-2">
              {(devicesQ.data?.devices ?? []).map((dev) => (
                <button
                  key={dev.id}
                  type="button"
                  onClick={() => setActiveId(dev.id)}
                  className={`w-full rounded-lg border px-3 py-3 text-left transition ${activeId === dev.id ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-950">{dev.name}</span>
                    <Badge variant="outline">{dev.kind === "ikuai" ? "iKuai" : "OpenWrt"}</Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">
                    {dev.prometheusScope || "network"} · {dev.instanceLabel || "未绑定 instance"}
                  </p>
                </button>
              ))}
              {devicesQ.isSuccess && (devicesQ.data?.devices.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                  还没有网络设备
                </p>
              ) : null}
            </div>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">当前设备</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {active ? `${active.name} · ${active.kind} · ${active.prometheusScope}` : "请选择或新增网络设备"}
                </p>
              </div>
              {active ? (
                <div className="flex flex-wrap gap-2">
                  {active.kind === "ikuai" ? (
                    <Button asChild variant="outline" size="sm" className="gap-1.5">
                      <Link to="/cluster/network/ikuai">
                        <RadioTower className="h-4 w-4" />
                        打开图表
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => statusQ.refetch()} disabled={statusQ.isFetching}>
                      {statusQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      探测指标族
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => deleteMut.mutate(active.id)} disabled={deleteMut.isPending}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          {active?.kind === "openwrt" ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">OpenWrt 指标族</h2>
                <Badge variant={statusQ.data?.prometheusConfigured ? "default" : "outline"}>
                  {statusQ.data?.prometheusConfigured ? "Prometheus 已配置" : "未配置 Prometheus"}
                </Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-5">
                {familyLabels.map(([key, label]) => (
                  <div key={key} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`mt-1 text-sm font-semibold ${families[key] ? "text-emerald-700" : "text-slate-500"}`}>
                      {families[key] ? "已发现" : "未发现"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                已发现 {familyReadyCount}/{familyLabels.length} 类指标。缺失提示：
                {(statusQ.data?.missingHints ?? []).join("；") || "暂无"}
              </p>
            </section>
          ) : (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-950">iKuai 数据源</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                当前 iKuai 图表仍复用原有 Prometheus 查询面板，Network 模块负责新入口和设备登记。
              </p>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-950">设备详情</h2>
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
                    ["ID", active?.id],
                    ["名称", active?.name],
                    ["类型", active?.kind],
                    ["Prometheus scope", active?.prometheusScope],
                    ["instance", active?.instanceLabel],
                    ["job", active?.jobLabel],
                    ["备注", active?.notes],
                    ["概览", overviewQ.isFetching ? "刷新中…" : JSON.stringify(overviewQ.data ?? {})],
                  ].map(([k, v]) => (
                    <TableRow key={String(k)}>
                      <TableCell className="w-48 text-slate-500">{k}</TableCell>
                      <TableCell className="break-all font-mono text-xs">{v || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default NetworkDashboard;
