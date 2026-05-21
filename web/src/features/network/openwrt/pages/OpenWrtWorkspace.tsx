import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cable, Gauge, Loader2, Network, Plus, RadioTower, RefreshCw, Trash2, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import NetworkDeviceSetupPanel from "@/features/network/components/NetworkDeviceSetupPanel";

export type OpenWrtView = "dashboard" | "interfaces" | "clients" | "connections" | "wireless" | "exporter";

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

type NetworkDeviceFormState = {
  kind: NetworkKind;
  name: string;
  prometheusScope: string;
  instanceLabel: string;
  jobLabel: string;
  notes: string;
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

type OpenWrtOverview = OpenWrtStatus & {
  device?: NetworkDevice;
  kind?: string;
};

type OpenWrtInterface = {
  name?: string;
  rxBytesPerSecond?: number;
  txBytesPerSecond?: number;
  up?: number | string | boolean;
};

type OpenWrtTraffic = {
  metric?: string;
  value?: number;
  labels?: Record<string, string>;
};

type GenericRow = Record<string, unknown>;

const familyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

const pageMeta: Record<OpenWrtView, { title: string; desc: string; icon: typeof Wifi }> = {
  dashboard: {
    title: "OpenWrt 总览",
    desc: "聚合 OpenWrt 设备、Prometheus 指标族和当前数据源状态。",
    icon: Wifi,
  },
  interfaces: {
    title: "OpenWrt 接口",
    desc: "读取 OpenWrt node network 指标，查看接口状态和 5 分钟收发速率。",
    icon: RadioTower,
  },
  clients: {
    title: "OpenWrt 客户端",
    desc: "对接 DHCP/邻居指标接口，展示客户端列表与当前缺失的 collector 提示。",
    icon: Users,
  },
  connections: {
    title: "OpenWrt 连接跟踪",
    desc: "读取 netstat/conntrack 指标，查看当前连接、连接跟踪和 TCP 打开量。",
    icon: Activity,
  },
  wireless: {
    title: "OpenWrt 无线",
    desc: "基于已发现指标名检查 Wi-Fi collector 和无线相关指标是否就绪。",
    icon: Wifi,
  },
  exporter: {
    title: "OpenWrt 数据源",
    desc: "检查 Prometheus 配置、OpenWrt 指标族发现情况和具体指标名称。",
    icon: Gauge,
  },
};

function text(v: unknown): string {
  if (v == null || v === "") return "-";
  return String(v);
}

function numeric(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtRate(v: unknown): string {
  const n = numeric(v);
  if (n == null) return "-";
  if (Math.abs(n) >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(2)} MiB/s`;
  if (Math.abs(n) >= 1024) return `${(n / 1024).toFixed(2)} KiB/s`;
  return `${n.toFixed(2)} B/s`;
}

function fmtValue(v: unknown): string {
  const n = numeric(v);
  if (n == null) return text(v);
  if (Math.abs(n) >= 1000) return n.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function fmtUpdatedAt(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function isUp(v: unknown): boolean | null {
  if (v === true) return true;
  if (v === false) return false;
  const n = numeric(v);
  if (n == null) return null;
  return n > 0;
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

function OpenWrtWorkspace({ view }: { view: OpenWrtView }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin";
  const meta = pageMeta[view];
  const Icon = meta.icon;
  const [activeId, setActiveId] = useState("");
  const [form, setForm] = useState({
    kind: "openwrt" as NetworkKind,
    name: "",
    prometheusScope: "network",
    instanceLabel: "",
    jobLabel: "",
    notes: "",
  });

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  const openWrtDevices = useMemo(
    () => (devicesQ.data?.devices ?? []).filter((x) => x.kind === "openwrt"),
    [devicesQ.data?.devices]
  );

  useEffect(() => {
    if (activeId && openWrtDevices.some((x) => x.id === activeId)) return;
    if (openWrtDevices.length > 0) setActiveId(openWrtDevices[0].id);
  }, [activeId, openWrtDevices]);

  const active = useMemo(
    () => openWrtDevices.find((x) => x.id === activeId),
    [activeId, openWrtDevices]
  );

  const statusQ = useQuery({
    queryKey: ["network-device-exporter-status", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtStatus>(`/api/network/devices/${activeId}/exporter-status`, { signal }),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 60_000 : false,
  });

  const overviewQ = useQuery({
    queryKey: ["network-device-overview", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtOverview>(`/api/network/devices/${activeId}/overview`, { signal }),
    enabled: Boolean(activeId && (view === "dashboard" || view === "exporter")),
    refetchInterval: activeId && (view === "dashboard" || view === "exporter") ? 60_000 : false,
  });

  const interfacesQ = useQuery({
    queryKey: ["network-device-interfaces", activeId],
    queryFn: ({ signal }) => apiGetJson<{ interfaces: OpenWrtInterface[]; note?: string; missingHints?: string[] }>(`/api/network/devices/${activeId}/interfaces`, { signal }),
    enabled: Boolean(activeId && view === "interfaces"),
    refetchInterval: activeId && view === "interfaces" ? 60_000 : false,
  });

  const clientsQ = useQuery({
    queryKey: ["network-device-clients", activeId],
    queryFn: ({ signal }) => apiGetJson<{ clients: GenericRow[]; note?: string; missingHints?: string[] }>(`/api/network/devices/${activeId}/clients`, { signal }),
    enabled: Boolean(activeId && view === "clients"),
    refetchInterval: activeId && view === "clients" ? 60_000 : false,
  });

  const trafficQ = useQuery({
    queryKey: ["network-device-traffic", activeId],
    queryFn: ({ signal }) => apiGetJson<{ traffic: OpenWrtTraffic[]; note?: string; missingHints?: string[] }>(`/api/network/devices/${activeId}/traffic`, { signal }),
    enabled: Boolean(activeId && view === "connections"),
    refetchInterval: activeId && view === "connections" ? 60_000 : false,
  });

  const families = statusQ.data?.families ?? overviewQ.data?.families ?? {};
  const metricNames = statusQ.data?.metricNames ?? overviewQ.data?.metricNames ?? [];
  const missingHints = statusQ.data?.missingHints ?? overviewQ.data?.missingHints ?? [];
  const familyReadyCount = familyLabels.filter(([key]) => Boolean(families[key])).length;
  const openWrtNeedsSetup = !devicesQ.isLoading && openWrtDevices.length === 0;

  const createMut = useMutation({
    mutationFn: () => apiPostJson<{ device: NetworkDevice }>("/api/network/devices", form),
    onSuccess: (res) => {
      toast.success("OpenWrt 设备已保存");
      setActiveId(res.device.id);
      setForm((f) => ({ ...f, name: "", instanceLabel: "", jobLabel: "", notes: "" }));
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("OpenWrt 设备已删除");
      setActiveId("");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const refresh = () => {
    if (view === "interfaces") void interfacesQ.refetch();
    else if (view === "clients") void clientsQ.refetch();
    else if (view === "connections") void trafficQ.refetch();
    else {
      void statusQ.refetch();
      void overviewQ.refetch();
    }
  };

  const pageFetching =
    devicesQ.isFetching ||
    statusQ.isFetching ||
    overviewQ.isFetching ||
    interfacesQ.isFetching ||
    clientsQ.isFetching ||
    trafficQ.isFetching;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">OpenWrt</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Icon className="h-6 w-6 text-cyan-600" />
              {meta.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{meta.desc}</p>
          </div>
          <Button variant="outline" className="w-fit gap-2" onClick={refresh} disabled={!activeId || pageFetching}>
            {pageFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            刷新
          </Button>
        </div>
      </section>

      {openWrtNeedsSetup ? (
        <OpenWrtSetupPanel
          form={form}
          setForm={setForm}
          canWrite={canWrite}
          pending={createMut.isPending}
          onSubmit={() => createMut.mutate()}
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="space-y-4">
            <DeviceForm form={form} setForm={setForm} canWrite={canWrite} pending={createMut.isPending} onSubmit={() => createMut.mutate()} />
            <DeviceList devices={openWrtDevices} activeId={activeId} loading={devicesQ.isLoading} onSelect={setActiveId} />
          </aside>

          <main className="space-y-4">
            <OpenWrtStats
              deviceCount={openWrtDevices.length}
              familyReadyCount={familyReadyCount}
              metricCount={metricNames.length}
              loading={statusQ.isLoading || devicesQ.isLoading}
            />
            <CurrentDeviceCard
              active={active}
              canWrite={canWrite}
              status={statusQ.data ?? overviewQ.data}
              deletePending={deleteMut.isPending}
              onDelete={(id) => deleteMut.mutate(id)}
            />

            {view === "dashboard" ? (
              <OpenWrtDashboardPanel active={active} status={statusQ.data ?? overviewQ.data} overview={overviewQ.data} families={families} missingHints={missingHints} />
            ) : null}
            {view === "interfaces" ? <OpenWrtInterfacesPanel rows={interfacesQ.data?.interfaces ?? []} loading={interfacesQ.isLoading} note={interfacesQ.data?.note} /> : null}
            {view === "clients" ? <OpenWrtClientsPanel rows={clientsQ.data?.clients ?? []} loading={clientsQ.isLoading} note={clientsQ.data?.note} hints={clientsQ.data?.missingHints ?? missingHints} /> : null}
            {view === "connections" ? <OpenWrtConnectionsPanel rows={trafficQ.data?.traffic ?? []} loading={trafficQ.isLoading} note={trafficQ.data?.note} hints={trafficQ.data?.missingHints ?? missingHints} /> : null}
            {view === "wireless" ? <OpenWrtWirelessPanel families={families} metricNames={metricNames} missingHints={missingHints} loading={statusQ.isLoading} /> : null}
            {view === "exporter" ? <OpenWrtExporterPanel status={statusQ.data ?? overviewQ.data} overview={overviewQ.data} families={families} metricNames={metricNames} missingHints={missingHints} loading={statusQ.isLoading || overviewQ.isLoading} /> : null}
          </main>
        </div>
      )}
    </div>
  );
}

function OpenWrtSetupPanel({
  form,
  setForm,
  canWrite,
  pending,
  onSubmit,
}: {
  form: NetworkDeviceFormState;
  setForm: React.Dispatch<React.SetStateAction<NetworkDeviceFormState>>;
  canWrite: boolean;
  pending: boolean;
  onSubmit: () => void;
}) {
  return (
    <NetworkDeviceSetupPanel
      kind="openwrt"
      mode="missing-device"
      title="请先登记 OpenWrt 设备"
      description="OpenWrt 的接口、客户端、连接和无线页面都需要先保存 Prometheus scope、instance 或 job 标签。登记后页面会继续探测 node_* 与 openwrt_* 指标。"
    >
      <DeviceForm
        form={form}
        setForm={setForm}
        canWrite={canWrite}
        pending={pending}
        onSubmit={onSubmit}
        embedded
      />
    </NetworkDeviceSetupPanel>
  );
}

function DeviceForm({
  form,
  setForm,
  canWrite,
  pending,
  onSubmit,
  embedded = false,
}: {
  form: NetworkDeviceFormState;
  setForm: React.Dispatch<React.SetStateAction<NetworkDeviceFormState>>;
  canWrite: boolean;
  pending: boolean;
  onSubmit: () => void;
  embedded?: boolean;
}) {
  return (
    <section className={embedded ? "rounded-lg border border-cyan-100 bg-cyan-50/40 p-4" : "rounded-xl border border-slate-200 bg-white p-4 shadow-sm"}>
      <h2 className="text-sm font-semibold text-slate-950">新增 OpenWrt 设备</h2>
      <div className="mt-4 space-y-3">
        <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-900">
          <span className="inline-flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            OpenWrt
          </span>
        </div>
        <div className="space-y-1.5">
          <Label>显示名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="旁路由 OpenWrt" />
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
        <Button className="w-full gap-2 bg-cyan-600 hover:bg-cyan-700" disabled={!canWrite || pending} onClick={onSubmit}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          保存设备
        </Button>
      </div>
    </section>
  );
}

function DeviceList({
  devices,
  activeId,
  loading,
  onSelect,
}: {
  devices: NetworkDevice[];
  activeId: string;
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-950">OpenWrt 设备</h2>
      <div className="mt-3 space-y-2">
        {devices.map((dev) => (
          <button
            key={dev.id}
            type="button"
            onClick={() => onSelect(dev.id)}
            className={`w-full rounded-lg border px-3 py-3 text-left transition ${activeId === dev.id ? "border-cyan-300 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-slate-950">{dev.name}</span>
              <Badge variant="outline">OpenWrt</Badge>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-slate-500">
              {dev.prometheusScope || "network"} · {dev.instanceLabel || "未绑定 instance"}
            </p>
          </button>
        ))}
        {loading ? <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">加载中...</p> : null}
        {!loading && devices.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">还没有 OpenWrt 设备</p>
        ) : null}
      </div>
    </section>
  );
}

function OpenWrtStats({
  deviceCount,
  familyReadyCount,
  metricCount,
  loading,
}: {
  deviceCount: number;
  familyReadyCount: number;
  metricCount: number;
  loading: boolean;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="OpenWrt 设备" value={loading ? "..." : deviceCount} />
      <MetricCard label="已发现指标族" value={loading ? "..." : `${familyReadyCount}/${familyLabels.length}`} />
      <MetricCard label="指标名称" value={loading ? "..." : metricCount} />
    </section>
  );
}

function CurrentDeviceCard({
  active,
  canWrite,
  status,
  deletePending,
  onDelete,
}: {
  active?: NetworkDevice;
  canWrite: boolean;
  status?: OpenWrtStatus;
  deletePending: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">当前设备</h2>
          <p className="mt-1 text-xs text-slate-500">
            {active ? `${active.name} · ${active.prometheusScope} · ${active.instanceLabel || "未绑定 instance"}` : "请选择或新增 OpenWrt 设备"}
          </p>
        </div>
        {active ? (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status?.prometheusConfigured ? "default" : "outline"}>
              {status?.prometheusConfigured ? "Prometheus 已配置" : "未配置 Prometheus"}
            </Badge>
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

function FamilyGrid({ families }: { families: OpenWrtFamilies }) {
  return (
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
  );
}

function HintList({ hints }: { hints: string[] }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-5 text-slate-600">
      {hints.length > 0 ? hints.join("；") : "暂无缺失提示"}
    </div>
  );
}

function OpenWrtDashboardPanel({
  active,
  status,
  overview,
  families,
  missingHints,
}: {
  active?: NetworkDevice;
  status?: OpenWrtStatus;
  overview?: OpenWrtOverview;
  families: OpenWrtFamilies;
  missingHints: string[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">指标族概况</h2>
        <Badge variant={status?.prometheusConfigured ? "default" : "outline"}>
          {status?.prometheusConfigured ? "Prometheus 已配置" : "未配置 Prometheus"}
        </Badge>
      </div>
      <FamilyGrid families={families} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <HintList hints={missingHints} />
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
                ["Prometheus scope", active?.prometheusScope],
                ["instance", active?.instanceLabel],
                ["job", active?.jobLabel],
                ["备注", active?.notes],
                ["更新时间", fmtUpdatedAt(active?.updatedAt)],
                ["概览", JSON.stringify(overview ?? {})],
              ].map(([k, v]) => (
                <TableRow key={String(k)}>
                  <TableCell className="w-44 text-slate-500">{k}</TableCell>
                  <TableCell className="break-all font-mono text-xs">{v || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}

function OpenWrtInterfacesPanel({ rows, loading, note }: { rows: OpenWrtInterface[]; loading: boolean; note?: string }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Cable className="h-4 w-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-950">接口列表</h2>
      </div>
      {note ? <p className="mb-3 text-xs text-slate-500">{note}</p> : null}
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>接口</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>接收速率</TableHead>
              <TableHead>发送速率</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={4} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={4} label="暂无 OpenWrt 接口数据" /> : null}
            {!loading
              ? rows.map((row) => {
                  const up = isUp(row.up);
                  return (
                    <TableRow key={text(row.name)}>
                      <TableCell className="font-mono text-xs">{text(row.name)}</TableCell>
                      <TableCell>
                        <Badge variant={up ? "default" : "outline"}>{up == null ? "-" : up ? "up" : "down"}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{fmtRate(row.rxBytesPerSecond)}</TableCell>
                      <TableCell className="font-mono text-xs">{fmtRate(row.txBytesPerSecond)}</TableCell>
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

function OpenWrtClientsPanel({ rows, loading, note, hints }: { rows: GenericRow[]; loading: boolean; note?: string; hints: string[] }) {
  const columns = useMemo(() => Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 6), [rows]);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-950">客户端列表</h2>
      </div>
      {note ? <p className="mb-3 text-xs leading-5 text-slate-500">{note}</p> : null}
      <div className="mb-3">
        <HintList hints={hints} />
      </div>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              {(columns.length > 0 ? columns : ["客户端"]).map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={Math.max(columns.length, 1)} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={Math.max(columns.length, 1)} label="暂无 OpenWrt 客户端数据" /> : null}
            {!loading
              ? rows.map((row, idx) => (
                  <TableRow key={String(row.id ?? row.mac ?? row.ip ?? idx)}>
                    {columns.map((col) => (
                      <TableCell key={col} className="font-mono text-xs">{text(row[col])}</TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function OpenWrtConnectionsPanel({ rows, loading, note, hints }: { rows: OpenWrtTraffic[]; loading: boolean; note?: string; hints: string[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-cyan-600" />
        <h2 className="text-sm font-semibold text-slate-950">连接指标</h2>
      </div>
      {note ? <p className="mb-3 text-xs text-slate-500">{note}</p> : null}
      {rows.length === 0 && hints.length > 0 ? <div className="mb-3"><HintList hints={hints} /></div> : null}
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>指标</TableHead>
              <TableHead>值</TableHead>
              <TableHead>标签</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={3} /> : null}
            {!loading && rows.length === 0 ? <EmptyCell colSpan={3} label="暂无 OpenWrt 连接指标" /> : null}
            {!loading
              ? rows.map((row, idx) => (
                  <TableRow key={`${row.metric ?? "metric"}-${idx}`}>
                    <TableCell className="font-mono text-xs">{text(row.metric)}</TableCell>
                    <TableCell className="font-mono text-xs">{fmtValue(row.value)}</TableCell>
                    <TableCell className="max-w-xl truncate font-mono text-xs">
                      {row.labels ? Object.entries(row.labels).map(([k, v]) => `${k}=${v}`).join(" · ") : "-"}
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

function OpenWrtWirelessPanel({
  families,
  metricNames,
  missingHints,
  loading,
}: {
  families: OpenWrtFamilies;
  metricNames: string[];
  missingHints: string[];
  loading: boolean;
}) {
  const wirelessMetrics = metricNames.filter((name) => /wifi|wireless|station_signal/i.test(name));
  const wifiHint = missingHints.filter((hint) => /无线|Wi-Fi|wifi/i.test(hint));
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wifi className="h-4 w-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-950">无线指标</h2>
        </div>
        <Badge variant={families.wifi ? "default" : "outline"}>{families.wifi ? "Wi-Fi 指标已发现" : "未发现 Wi-Fi 指标"}</Badge>
      </div>
      {wifiHint.length > 0 ? <div className="mb-3"><HintList hints={wifiHint} /></div> : null}
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>无线相关指标名</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={1} /> : null}
            {!loading && wirelessMetrics.length === 0 ? <EmptyCell colSpan={1} label="暂无 OpenWrt 无线指标" /> : null}
            {!loading
              ? wirelessMetrics.map((name) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-xs">{name}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function OpenWrtExporterPanel({
  status,
  overview,
  families,
  metricNames,
  missingHints,
  loading,
}: {
  status?: OpenWrtStatus;
  overview?: OpenWrtOverview;
  families: OpenWrtFamilies;
  metricNames: string[];
  missingHints: string[];
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-cyan-600" />
          <h2 className="text-sm font-semibold text-slate-950">数据源状态</h2>
        </div>
        <Badge variant={status?.prometheusConfigured ? "default" : "outline"}>
          {status?.prometheusConfigured ? "Prometheus 已配置" : "未配置 Prometheus"}
        </Badge>
      </div>
      <FamilyGrid families={families} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <HintList hints={missingHints} />
        <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
          <p className="font-medium text-slate-900">接口返回</p>
          <p className="mt-1 break-all font-mono">{loading ? "加载中..." : JSON.stringify(overview ?? status ?? {})}</p>
        </div>
      </div>
      <div className="mt-4 overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>已发现指标名</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingCell colSpan={1} /> : null}
            {!loading && metricNames.length === 0 ? <EmptyCell colSpan={1} label="暂无 OpenWrt 指标名" /> : null}
            {!loading
              ? metricNames.map((name) => (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-xs">{name}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default OpenWrtWorkspace;
