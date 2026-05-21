import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cable, Gauge, Loader2, Network, RadioTower, RefreshCw, Shield, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import OpenWrtActionPanel from "./OpenWrtActionPanel";
import OpenWrtTargetPanel, { type OpenWrtTargetForm } from "./OpenWrtTargetPanel";

export type OpenWrtView = "dashboard" | "interfaces" | "clients" | "connections" | "wireless" | "exporter";

export type NetworkDevice = {
  id: string;
  kind: "ikuai" | "openwrt";
  name: string;
  apiUrl?: string;
  host?: string;
  port?: number;
  authType?: string;
  username?: string;
  passwordSet?: boolean;
  privateKeySet?: boolean;
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
  source?: string;
};

type OpenWrtOverview = {
  device?: NetworkDevice;
  board?: Record<string, unknown>;
  system?: Record<string, unknown>;
  raw?: Record<string, string>;
  errors?: string[];
  source?: string;
  checkedAt?: string;
};

type OpenWrtInterfaces = {
  interfaceDump?: { interface?: Array<Record<string, unknown>> };
  ipAddr?: Array<Record<string, unknown>>;
  ipRoute?: Array<Record<string, unknown>>;
  raw?: Record<string, string>;
  errors?: string[];
};

type ClientLease = { expires?: string; mac?: string; ip?: string; host?: string; id?: string; source?: string };
type Neighbor = { ip?: string; dev?: string; mac?: string; state?: string; source?: string };

type OpenWrtClients = {
  leases?: ClientLease[];
  neighbors?: Neighbor[];
  raw?: Record<string, string>;
  errors?: string[];
};

type UCIEntry = { key?: string; value?: string; package?: string; section?: string; option?: string };
type WirelessStation = { interface?: string; mac?: string; signal?: unknown; rxRate?: unknown; txRate?: unknown };

type OpenWrtWireless = {
  radios?: UCIEntry[];
  ifaces?: string[];
  stations?: WirelessStation[];
  raw?: Record<string, string>;
  errors?: string[];
};

type OpenWrtFirewall = {
  firewallConfig?: UCIEntry[];
  conntrackCount?: string;
  raw?: Record<string, string>;
  errors?: string[];
};

const OPENWRT_PROBE_ENDPOINT = "/api/network/devices/openwrt/probe";

const pageMeta: Record<OpenWrtView, { title: string; desc: string; icon: typeof Wifi }> = {
  dashboard: { title: "OpenWrt 总览", desc: "通过 SSH/ubus 读取系统、版本、负载、内存、磁盘和接口状态。", icon: Wifi },
  interfaces: { title: "OpenWrt 接口", desc: "读取 ubus network.interface、ip addr 和路由表，展示真实接口状态。", icon: Cable },
  clients: { title: "OpenWrt 客户端", desc: "读取 DHCP 租约和邻居表，展示当前接入终端。", icon: Users },
  connections: { title: "OpenWrt 防火墙/连接", desc: "读取 firewall UCI、nft/iptables 规则和 conntrack 计数。", icon: Shield },
  wireless: { title: "OpenWrt 无线", desc: "读取 wireless UCI 和 hostapd 客户端，展示无线配置与关联终端。", icon: RadioTower },
  exporter: { title: "OpenWrt 监控增强", desc: "检查 Prometheus 指标族和缺失 collector 提示。", icon: Gauge },
};

const familyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

function text(v: unknown): string {
  if (v == null || v === "") return "-";
  return String(v);
}

function fmtTime(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "-";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString("zh-CN", { hour12: false });
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">
        加载中...
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-sm text-slate-500">
        {label}
      </TableCell>
    </TableRow>
  );
}

function ErrorList({ errors }: { errors?: string[] }) {
  const rows = errors?.filter(Boolean) ?? [];
  if (rows.length === 0) return null;
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
      {rows.map((err) => (
        <p key={err}>{err}</p>
      ))}
    </div>
  );
}

function OpenWrtWorkspace({ view }: { view: OpenWrtView }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const meta = pageMeta[view];
  const Icon = meta.icon;
  const [activeId, setActiveId] = useState("");

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  const openWrtDevices = useMemo(() => (devicesQ.data?.devices ?? []).filter((x) => x.kind === "openwrt"), [devicesQ.data]);

  useEffect(() => {
    if (activeId && openWrtDevices.some((x) => x.id === activeId)) return;
    setActiveId(openWrtDevices[0]?.id ?? "");
  }, [activeId, openWrtDevices]);

  const active = openWrtDevices.find((x) => x.id === activeId);

  const createTarget = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson("/api/network/devices", { kind: "openwrt", ...body }),
    onSuccess: () => {
      toast.success("OpenWrt 目标已保存");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
  });

  const deleteTarget = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("OpenWrt 目标已删除");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
  });

  const probeTarget = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson<{ probe?: { reachable?: boolean; errors?: string[] } }>(OPENWRT_PROBE_ENDPOINT, { kind: "openwrt", ...body }),
    onSuccess: (res) => {
      if (res.probe?.reachable) toast.success("OpenWrt SSH/ubus 探测通过");
      else toast.warning(res.probe?.errors?.join("; ") || "OpenWrt 探测未通过");
    },
  });

  const runAction = useMutation({
    mutationFn: ({ action, confirm }: { action: string; confirm?: boolean }) =>
      apiPostJson(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/actions`, { action, confirm }),
    onSuccess: () => toast.success("OpenWrt 操作已提交"),
  });

  const exporterQ = useQuery({
    queryKey: ["openwrt-exporter-status", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtStatus>(`/api/network/devices/${encodeURIComponent(activeId)}/exporter-status`, { signal }),
    enabled: Boolean(activeId),
    refetchInterval: activeId ? 60_000 : false,
  });

  const overviewQ = useQuery({
    queryKey: ["openwrt-overview", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtOverview>(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/overview`, { signal }),
    enabled: Boolean(activeId && view === "dashboard"),
  });

  const interfacesQ = useQuery({
    queryKey: ["openwrt-interfaces", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtInterfaces>(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/interfaces`, { signal }),
    enabled: Boolean(activeId && view === "interfaces"),
  });

  const clientsQ = useQuery({
    queryKey: ["openwrt-clients", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtClients>(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/clients`, { signal }),
    enabled: Boolean(activeId && view === "clients"),
  });

  const wirelessQ = useQuery({
    queryKey: ["openwrt-wireless", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtWireless>(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/wireless`, { signal }),
    enabled: Boolean(activeId && view === "wireless"),
  });

  const firewallQ = useQuery({
    queryKey: ["openwrt-firewall", activeId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtFirewall>(`/api/network/devices/${encodeURIComponent(activeId)}/openwrt/firewall`, { signal }),
    enabled: Boolean(activeId && view === "connections"),
  });

  const families = exporterQ.data?.families ?? {};
  const missingHints = exporterQ.data?.missingHints ?? [];
  const metricNames = exporterQ.data?.metricNames ?? [];
  const readyFamilies = familyLabels.filter(([key]) => families[key]).length;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Icon className="mt-1 h-5 w-5 text-cyan-700" />
            <div>
              <p className="text-xs font-semibold uppercase text-cyan-700">OpenWrt</p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{meta.title}</h1>
              <p className="mt-1 text-sm text-slate-600">{meta.desc}</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void qc.invalidateQueries({ queryKey: ["network-devices"] });
              void qc.invalidateQueries({ queryKey: ["openwrt-exporter-status", activeId] });
              void qc.invalidateQueries({ queryKey: ["openwrt-overview", activeId] });
              void qc.invalidateQueries({ queryKey: ["openwrt-interfaces", activeId] });
              void qc.invalidateQueries({ queryKey: ["openwrt-clients", activeId] });
              void qc.invalidateQueries({ queryKey: ["openwrt-wireless", activeId] });
              void qc.invalidateQueries({ queryKey: ["openwrt-firewall", activeId] });
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <OpenWrtTargetPanel
            devices={openWrtDevices}
            activeId={activeId}
            canWrite={canWrite}
            loading={devicesQ.isLoading}
            probeEndpoint={OPENWRT_PROBE_ENDPOINT}
            creating={createTarget.isPending}
            probing={probeTarget.isPending}
            deletingId={deleteTarget.variables}
            onActiveChange={setActiveId}
            onCreate={(body) => createTarget.mutate(body)}
            onProbe={(body) => probeTarget.mutate(body)}
            onDelete={(id) => deleteTarget.mutate(id)}
          />
          <OpenWrtActionPanel
            target={active}
            canWrite={canWrite}
            running={runAction.isPending}
            onAction={(action, confirm) => runAction.mutate({ action, confirm })}
          />
        </div>

        <div className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="当前目标" value={active?.name || "未选择"} hint={active?.host || active?.apiUrl || "-"} />
              <Metric label="受管目标" value={openWrtDevices.length} hint="OpenWrt" />
              <Metric label="SSH 凭据" value={active?.passwordSet || active?.privateKeySet ? "已保存" : "未保存"} hint={active?.username || "root"} />
              <Metric label="监控指标族" value={`${readyFamilies}/5`} hint="Prometheus 增强" />
            </div>
          </section>

          {!active ? (
            <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              请先在左侧新增 OpenWrt 目标。
            </section>
          ) : null}

          {active && view === "dashboard" ? <DashboardPanel data={overviewQ.data} loading={overviewQ.isLoading} /> : null}
          {active && view === "interfaces" ? <InterfacesPanel data={interfacesQ.data} loading={interfacesQ.isLoading} /> : null}
          {active && view === "clients" ? <ClientsPanel data={clientsQ.data} loading={clientsQ.isLoading} /> : null}
          {active && view === "connections" ? <FirewallPanel data={firewallQ.data} loading={firewallQ.isLoading} /> : null}
          {active && view === "wireless" ? <WirelessPanel data={wirelessQ.data} loading={wirelessQ.isLoading} /> : null}
          {active && view === "exporter" ? (
            <ExporterPanel data={exporterQ.data} loading={exporterQ.isLoading} families={families} hints={missingHints} metricNames={metricNames} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{hint || "-"}</p>
    </div>
  );
}

function DashboardPanel({ data, loading }: { data?: OpenWrtOverview; loading: boolean }) {
  const board = data?.board ?? {};
  const system = data?.system ?? {};
  return (
    <Panel title="系统状态" icon={<Network className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <Metric label="主机名" value={text(board.hostname)} hint={text(board.model)} />
        <Metric label="系统版本" value={text(board.release && typeof board.release === "object" ? (board.release as Record<string, unknown>).description : board.release)} hint={text(board.kernel)} />
        <Metric label="运行时间" value={text(system.uptime)} hint="秒" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <JsonBlock value={board} />
        <JsonBlock value={system} />
      </div>
      <ErrorList errors={data?.errors} />
    </Panel>
  );
}

function InterfacesPanel({ data, loading }: { data?: OpenWrtInterfaces; loading: boolean }) {
  const rows = data?.interfaceDump?.interface ?? [];
  return (
    <Panel title="接口列表" icon={<Cable className="h-4 w-4 text-cyan-700" />}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>接口</TableHead>
            <TableHead>协议</TableHead>
            <TableHead>设备</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>IPv4</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <LoadingRow colSpan={5} /> : null}
          {!loading && rows.length === 0 ? <EmptyRow colSpan={5} label="未从 ubus 读取到接口" /> : null}
          {!loading
            ? rows.map((row, idx) => (
                <TableRow key={String(row.interface ?? row.ifname ?? idx)}>
                  <TableCell className="font-mono text-xs">{text(row.interface)}</TableCell>
                  <TableCell>{text(row.proto)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.device ?? row.l3_device)}</TableCell>
                  <TableCell>
                    <Badge variant={row.up ? "default" : "outline"}>{row.up ? "up" : "down"}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{Array.isArray(row["ipv4-address"]) ? JSON.stringify(row["ipv4-address"]) : "-"}</TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
      <ErrorList errors={data?.errors} />
    </Panel>
  );
}

function ClientsPanel({ data, loading }: { data?: OpenWrtClients; loading: boolean }) {
  const leases = data?.leases ?? [];
  const neighbors = data?.neighbors ?? [];
  return (
    <Panel title="客户端" icon={<Users className="h-4 w-4 text-cyan-700" />}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>主机名</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>MAC</TableHead>
            <TableHead>租约</TableHead>
            <TableHead>来源</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? <LoadingRow colSpan={5} /> : null}
          {!loading && leases.length === 0 ? <EmptyRow colSpan={5} label="未发现 DHCP 租约" /> : null}
          {!loading
            ? leases.map((row, idx) => (
                <TableRow key={`${row.mac}-${row.ip}-${idx}`}>
                  <TableCell>{text(row.host)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.ip)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.mac)}</TableCell>
                  <TableCell className="font-mono text-xs">{text(row.expires)}</TableCell>
                  <TableCell>{text(row.source)}</TableCell>
                </TableRow>
              ))
            : null}
        </TableBody>
      </Table>
      <div className="mt-4">
        <h3 className="mb-2 text-sm font-medium text-slate-900">邻居表</h3>
        <JsonBlock value={neighbors} />
      </div>
      <ErrorList errors={data?.errors} />
    </Panel>
  );
}

function WirelessPanel({ data, loading }: { data?: OpenWrtWireless; loading: boolean }) {
  return (
    <Panel title="无线配置与客户端" icon={<Wifi className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">wireless UCI</h3>
          <JsonBlock value={data?.radios ?? []} />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">关联客户端</h3>
          <JsonBlock value={data?.stations ?? []} />
        </div>
      </div>
      <ErrorList errors={data?.errors} />
    </Panel>
  );
}

function FirewallPanel({ data, loading }: { data?: OpenWrtFirewall; loading: boolean }) {
  return (
    <Panel title="防火墙与连接" icon={<Activity className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Metric label="conntrack" value={data?.conntrackCount || "-"} hint="/proc/sys/net/netfilter/nf_conntrack_count" />
        <Metric label="firewall 配置项" value={data?.firewallConfig?.length ?? 0} hint="uci show firewall" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <JsonBlock value={data?.firewallConfig ?? []} />
        <JsonBlock value={data?.raw?.ruleset ?? ""} />
      </div>
      <ErrorList errors={data?.errors} />
    </Panel>
  );
}

function ExporterPanel({ data, loading, families, hints, metricNames }: { data?: OpenWrtStatus; loading: boolean; families: OpenWrtFamilies; hints: string[]; metricNames: string[] }) {
  return (
    <Panel title="Prometheus 监控增强" icon={<Gauge className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {familyLabels.map(([key, label]) => (
          <Badge key={key} variant={families[key] ? "default" : "outline"}>
            {label}: {families[key] ? "已发现" : "缺失"}
          </Badge>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <JsonBlock value={hints} />
        <JsonBlock value={metricNames} />
      </div>
      <p className="mt-3 text-xs text-slate-500">当前状态：{data?.prometheusConfigured ? "Prometheus 已配置" : "Prometheus 未配置或未返回指标"}</p>
    </Panel>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function InlineLoading() {
  return (
    <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      加载中...
    </div>
  );
}

export default OpenWrtWorkspace;
