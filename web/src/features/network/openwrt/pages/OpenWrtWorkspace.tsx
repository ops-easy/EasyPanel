import React, { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Cable, Gauge, Loader2, Network, RadioTower, RefreshCw, Shield, Users, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import NetworkDeviceSetupPanel from "@/features/network/components/NetworkDeviceSetupPanel";
import { singleNetworkDeviceByKind, deviceQueryHint } from "@/features/network/components/networkDeviceSingleton";
import {
  EmptyTableRow,
  formatDateTime,
  formatDurationSeconds,
  LoadingTableRow,
  NetworkErrorList,
  NetworkMetricCard,
  networkText,
  NetworkStatusBadge,
  RawDataDisclosure,
} from "@/features/network/components/NetworkOpsPrimitives";
import OpenWrtActionPanel from "./OpenWrtActionPanel";
import OpenWrtInstancePanel, { type OpenWrtTargetForm } from "./OpenWrtTargetPanel";

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

type OpenWrtSystemSummary = {
  hostname: string;
  model: string;
  release: string;
  kernel: string;
  uptime: string;
  localTime: string;
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

type OpenWrtInterfaceRow = {
  name: string;
  proto: string;
  device: string;
  up?: boolean;
  ipv4: string;
  uptime: string;
};

type OpenWrtInterfaces = {
  interfaceDump?: { interface?: Array<Record<string, unknown>> };
  ipAddr?: Array<Record<string, unknown>>;
  ipRoute?: Array<Record<string, unknown>>;
  raw?: Record<string, string>;
  errors?: string[];
};

type OpenWrtClientRow = { host?: string; ip?: string; mac?: string; expires?: string; source?: string };
type NeighborRow = { ip?: string; dev?: string; mac?: string; state?: string; source?: string };

type OpenWrtClients = {
  leases?: OpenWrtClientRow[];
  neighbors?: NeighborRow[];
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

function releaseText(value: unknown): string {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return networkText(row.description ?? row.version);
  }
  return networkText(value);
}

function mapSystemSummary(data?: OpenWrtOverview): OpenWrtSystemSummary {
  const board = data?.board ?? {};
  const system = data?.system ?? {};
  return {
    hostname: networkText(board.hostname),
    model: networkText(board.model),
    release: releaseText(board.release),
    kernel: networkText(board.kernel),
    uptime: formatDurationSeconds(system.uptime),
    localTime: formatDateTime(system.localtime),
  };
}

function formatIPv4List(value: unknown): string {
  if (!Array.isArray(value)) return "-";
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      const address = String(row.address ?? "").trim();
      const mask = String(row.mask ?? "").trim();
      return address ? `${address}${mask ? `/${mask}` : ""}` : "";
    })
    .filter(Boolean)
    .join(", ") || "-";
}

function mapInterfaceRows(data?: OpenWrtInterfaces): OpenWrtInterfaceRow[] {
  return (data?.interfaceDump?.interface ?? []).map((row) => ({
    name: networkText(row.interface),
    proto: networkText(row.proto),
    device: networkText(row.device ?? row.l3_device),
    up: Boolean(row.up),
    ipv4: formatIPv4List(row["ipv4-address"]),
    uptime: formatDurationSeconds(row.uptime),
  }));
}

function OpenWrtWorkspace({ view }: { view: OpenWrtView }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const canViewRaw = status?.role === "admin";
  const meta = pageMeta[view];
  const Icon = meta.icon;

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  const openWrtDevices = useMemo(() => (devicesQ.data?.devices ?? []).filter((x) => x.kind === "openwrt"), [devicesQ.data]);
  const openWrtTargetsInitialLoading = devicesQ.isLoading && !devicesQ.data;
  const openWrtNeedsSetup = !openWrtTargetsInitialLoading && openWrtDevices.length === 0;
  const active = useMemo(() => singleNetworkDeviceByKind(openWrtDevices, "openwrt"), [openWrtDevices]);
  const activeId = active?.id ?? "";

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

      {openWrtTargetsInitialLoading ? (
        <OpenWrtTargetsLoadingPanel />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="space-y-5">
            {openWrtNeedsSetup ? <OpenWrtSetupPanel /> : null}
            <OpenWrtInstancePanel
              device={active}
              activeId={activeId}
              canWrite={canWrite}
              loading={devicesQ.isLoading}
              probeEndpoint={OPENWRT_PROBE_ENDPOINT}
              creating={createTarget.isPending}
              probing={probeTarget.isPending}
              deletingId={deleteTarget.variables}
              onCreate={(body) => createTarget.mutate(body)}
              onProbe={(body) => probeTarget.mutate(body)}
              onDelete={(id) => deleteTarget.mutate(id)}
            />
            {!openWrtNeedsSetup ? (
              <OpenWrtActionPanel
                target={active}
                canWrite={canWrite}
                running={runAction.isPending}
                onAction={(action, confirm) => runAction.mutate({ action, confirm })}
              />
            ) : null}
          </div>

          <div className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-3 md:grid-cols-4">
                <NetworkMetricCard label="当前目标" value={active?.name || "未选择"} hint={active?.host || active?.apiUrl || "-"} tone="cyan" />
                <NetworkMetricCard label="受管目标" value={openWrtDevices.length} hint="OpenWrt 单实例" />
                <NetworkMetricCard label="SSH 凭据" value={active?.passwordSet || active?.privateKeySet ? "已保存" : "未保存"} hint={active?.username || "root"} tone={active?.passwordSet || active?.privateKeySet ? "emerald" : "amber"} />
                <NetworkMetricCard label="监控指标族" value={`${readyFamilies}/5`} hint={deviceQueryHint(active)} tone="emerald" />
              </div>
            </section>

            {!active ? (
              <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
                请先在左侧新增 OpenWrt 目标。
              </section>
            ) : null}

            {active && view === "dashboard" ? <DashboardPanel data={overviewQ.data} loading={overviewQ.isLoading} canViewRaw={canViewRaw} /> : null}
            {active && view === "interfaces" ? <InterfacesPanel data={interfacesQ.data} loading={interfacesQ.isLoading} canViewRaw={canViewRaw} /> : null}
            {active && view === "clients" ? <ClientsPanel data={clientsQ.data} loading={clientsQ.isLoading} canViewRaw={canViewRaw} /> : null}
            {active && view === "connections" ? <FirewallPanel data={firewallQ.data} loading={firewallQ.isLoading} canViewRaw={canViewRaw} /> : null}
            {active && view === "wireless" ? <WirelessPanel data={wirelessQ.data} loading={wirelessQ.isLoading} canViewRaw={canViewRaw} /> : null}
            {active && view === "exporter" ? (
              <ExporterPanel data={exporterQ.data} loading={exporterQ.isLoading} families={families} hints={missingHints} metricNames={metricNames} canViewRaw={canViewRaw} />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenWrtTargetsLoadingPanel() {
  return (
    <NetworkDeviceSetupPanel
      kind="openwrt"
      mode="missing-device"
      title="正在读取 OpenWrt 目标"
      description="正在确认是否已有 OpenWrt 管理目标，完成后会显示目标工作区或新增表单。"
    >
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />
        加载中...
      </div>
    </NetworkDeviceSetupPanel>
  );
}

function OpenWrtSetupPanel() {
  return (
    <NetworkDeviceSetupPanel
      kind="openwrt"
      mode="missing-device"
      title="请先登记 OpenWrt 目标"
      description="OpenWrt 页面需要先保存 SSH 管理地址、root 凭据和可选 Prometheus 标签。保存后，接口、客户端、无线和防火墙页面会切换到该目标的数据视图。"
      compact
    />
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

function KeyValueGrid({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-900" title={String(value ?? "")}>{value}</p>
        </div>
      ))}
    </div>
  );
}

function DashboardPanel({ data, loading, canViewRaw }: { data?: OpenWrtOverview; loading: boolean; canViewRaw: boolean }) {
  const summary = mapSystemSummary(data);
  return (
    <Panel title="系统状态" icon={<Network className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <NetworkMetricCard label="主机名" value={summary.hostname} hint={summary.model} tone="cyan" />
        <NetworkMetricCard label="系统版本" value={summary.release} hint={summary.kernel} />
        <NetworkMetricCard label="运行时间" value={summary.uptime} hint={summary.localTime} tone="emerald" />
      </div>
      <div className="mt-4">
        <KeyValueGrid
          rows={[
            ["数据来源", data?.source || "SSH/ubus"],
            ["检查时间", formatDateTime(data?.checkedAt)],
            ["设备型号", summary.model],
            ["内核版本", summary.kernel],
          ]}
        />
      </div>
      <div className="mt-4 space-y-3">
        <NetworkErrorList errors={data?.errors} />
        <RawDataDisclosure value={{ board: data?.board, system: data?.system, raw: data?.raw }} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function InterfacesPanel({ data, loading, canViewRaw }: { data?: OpenWrtInterfaces; loading: boolean; canViewRaw: boolean }) {
  const rows = mapInterfaceRows(data);
  return (
    <Panel title="接口列表" icon={<Cable className="h-4 w-4 text-cyan-700" />}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>接口</TableHead>
              <TableHead>协议</TableHead>
              <TableHead>设备</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>IPv4</TableHead>
              <TableHead>运行时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingTableRow colSpan={6} /> : null}
            {!loading && rows.length === 0 ? <EmptyTableRow colSpan={6} label="未从 ubus 读取到接口" /> : null}
            {!loading
              ? rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-mono text-xs">{row.name}</TableCell>
                    <TableCell>{row.proto}</TableCell>
                    <TableCell className="font-mono text-xs">{row.device}</TableCell>
                    <TableCell>
                      <NetworkStatusBadge ok={row.up} label={row.up ? "up" : "down"} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.ipv4}</TableCell>
                    <TableCell>{row.uptime}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 space-y-3">
        <NetworkErrorList errors={data?.errors} />
        <RawDataDisclosure value={{ ipAddr: data?.ipAddr, ipRoute: data?.ipRoute, raw: data?.raw }} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function ClientsPanel({ data, loading, canViewRaw }: { data?: OpenWrtClients; loading: boolean; canViewRaw: boolean }) {
  const leases = data?.leases ?? [];
  const neighbors = data?.neighbors ?? [];
  return (
    <Panel title="客户端" icon={<Users className="h-4 w-4 text-cyan-700" />}>
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <NetworkMetricCard label="DHCP 租约" value={leases.length} hint="leases" tone="cyan" />
        <NetworkMetricCard label="邻居表" value={neighbors.length} hint="ip neigh" tone="emerald" />
        <NetworkMetricCard label="数据来源" value={leases[0]?.source || neighbors[0]?.source || "-"} hint="SSH" />
      </div>
      <div className="overflow-x-auto">
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
            {loading ? <LoadingTableRow colSpan={5} /> : null}
            {!loading && leases.length === 0 ? <EmptyTableRow colSpan={5} label="未发现 DHCP 租约" /> : null}
            {!loading
              ? leases.map((row, idx) => (
                  <TableRow key={`${row.mac}-${row.ip}-${idx}`}>
                    <TableCell>{networkText(row.host)}</TableCell>
                    <TableCell className="font-mono text-xs">{networkText(row.ip)}</TableCell>
                    <TableCell className="font-mono text-xs">{networkText(row.mac)}</TableCell>
                    <TableCell className="font-mono text-xs">{networkText(row.expires)}</TableCell>
                    <TableCell>{networkText(row.source)}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      <div className="mt-5 overflow-x-auto">
        <h3 className="mb-2 text-sm font-medium text-slate-900">邻居表</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP</TableHead>
              <TableHead>接口</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>来源</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && neighbors.length === 0 ? <EmptyTableRow colSpan={5} label="未读取到邻居表" /> : null}
            {neighbors.map((row, idx) => (
              <TableRow key={`${row.ip}-${row.mac}-${idx}`}>
                <TableCell className="font-mono text-xs">{networkText(row.ip)}</TableCell>
                <TableCell>{networkText(row.dev)}</TableCell>
                <TableCell className="font-mono text-xs">{networkText(row.mac)}</TableCell>
                <TableCell>{networkText(row.state)}</TableCell>
                <TableCell>{networkText(row.source)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 space-y-3">
        <NetworkErrorList errors={data?.errors} />
        <RawDataDisclosure value={{ raw: data?.raw }} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function WirelessPanel({ data, loading, canViewRaw }: { data?: OpenWrtWireless; loading: boolean; canViewRaw: boolean }) {
  const radios = data?.radios ?? [];
  const stations = data?.stations ?? [];
  return (
    <Panel title="无线配置与客户端" icon={<Wifi className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <NetworkMetricCard label="UCI 配置项" value={radios.length} hint="wireless" tone="cyan" />
        <NetworkMetricCard label="关联客户端" value={stations.length} hint="hostapd" tone="emerald" />
        <NetworkMetricCard label="无线接口" value={data?.ifaces?.length ?? 0} hint={data?.ifaces?.join(", ") || "-"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <TableBlock title="wireless UCI">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Option</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && radios.length === 0 ? <EmptyTableRow colSpan={3} label="未读取到 wireless UCI" /> : null}
              {radios.slice(0, 80).map((row, idx) => (
                <TableRow key={`${row.section}-${row.option}-${idx}`}>
                  <TableCell className="font-mono text-xs">{networkText(row.section)}</TableCell>
                  <TableCell className="font-mono text-xs">{networkText(row.option ?? row.key)}</TableCell>
                  <TableCell className="max-w-[260px] truncate font-mono text-xs" title={networkText(row.value)}>{networkText(row.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableBlock>
        <TableBlock title="关联客户端">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>接口</TableHead>
                <TableHead>MAC</TableHead>
                <TableHead>信号</TableHead>
                <TableHead>速率</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && stations.length === 0 ? <EmptyTableRow colSpan={4} label="未发现无线关联客户端" /> : null}
              {stations.map((row, idx) => (
                <TableRow key={`${row.interface}-${row.mac}-${idx}`}>
                  <TableCell>{networkText(row.interface)}</TableCell>
                  <TableCell className="font-mono text-xs">{networkText(row.mac)}</TableCell>
                  <TableCell>{networkText(row.signal)}</TableCell>
                  <TableCell>{networkText(row.rxRate)} / {networkText(row.txRate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableBlock>
      </div>
      <div className="mt-4 space-y-3">
        <NetworkErrorList errors={data?.errors} />
        <RawDataDisclosure value={{ raw: data?.raw }} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function FirewallPanel({ data, loading, canViewRaw }: { data?: OpenWrtFirewall; loading: boolean; canViewRaw: boolean }) {
  const config = data?.firewallConfig ?? [];
  const ruleset = data?.raw?.ruleset ?? "";
  return (
    <Panel title="防火墙与连接" icon={<Activity className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <NetworkMetricCard label="conntrack" value={data?.conntrackCount || "-"} hint="/proc/sys/net/netfilter/nf_conntrack_count" tone="cyan" />
        <NetworkMetricCard label="firewall 配置项" value={config.length} hint="uci show firewall" tone="emerald" />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <TableBlock title="firewall UCI">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead>Option</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && config.length === 0 ? <EmptyTableRow colSpan={3} label="未读取到 firewall UCI" /> : null}
              {config.slice(0, 100).map((row, idx) => (
                <TableRow key={`${row.section}-${row.option}-${idx}`}>
                  <TableCell className="font-mono text-xs">{networkText(row.section)}</TableCell>
                  <TableCell className="font-mono text-xs">{networkText(row.option ?? row.key)}</TableCell>
                  <TableCell className="max-w-[280px] truncate font-mono text-xs" title={networkText(row.value)}>{networkText(row.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableBlock>
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">规则摘要</h3>
          <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
            {ruleset || "未读取到 nft/iptables 规则输出"}
          </pre>
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <NetworkErrorList errors={data?.errors} />
        <RawDataDisclosure value={{ raw: data?.raw }} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function ExporterPanel({
  data,
  loading,
  families,
  hints,
  metricNames,
  canViewRaw,
}: {
  data?: OpenWrtStatus;
  loading: boolean;
  families: OpenWrtFamilies;
  hints: string[];
  metricNames: string[];
  canViewRaw: boolean;
}) {
  return (
    <Panel title="Prometheus 监控增强" icon={<Gauge className="h-4 w-4 text-cyan-700" />}>
      {loading ? <InlineLoading /> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-5">
        {familyLabels.map(([key, label]) => (
          <div key={key} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <div className="mt-2">
              <NetworkStatusBadge ok={families[key]} label={families[key] ? "已发现" : "缺失"} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-medium text-slate-900">缺失提示</h3>
          {hints.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">暂无缺失提示。</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm leading-5 text-amber-800">
              {hints.map((hint) => (
                <li key={hint}>• {hint}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <h3 className="text-sm font-medium text-slate-900">已发现指标</h3>
          <div className="mt-3 flex max-h-56 flex-wrap gap-2 overflow-auto">
            {metricNames.length === 0 ? <p className="text-sm text-slate-500">Prometheus 未返回 OpenWrt 指标。</p> : null}
            {metricNames.map((name) => (
              <Badge key={name} variant="outline" className="font-mono text-[11px]">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">当前状态：{data?.prometheusConfigured ? "Prometheus 已配置" : "Prometheus 未配置或未返回指标"}</p>
      <div className="mt-4">
        <RawDataDisclosure value={data} visible={canViewRaw} />
      </div>
    </Panel>
  );
}

function TableBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <h3 className="mb-2 text-sm font-medium text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

export default OpenWrtWorkspace;
