import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, Cable, ChevronRight, Gauge, Network, RefreshCw, Search, Users, Wifi } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";
import {
  deviceQueryHint,
  singleNetworkDeviceByKind,
  type NetworkDeviceKind,
  type SingletonNetworkDevice,
} from "@/features/network/components/networkDeviceSingleton";
import {
  EmptyTableRow,
  formatDateTime,
  formatDurationSeconds,
  formatRate,
  LoadingTableRow,
  NetworkErrorList,
  networkText,
  RawDataDisclosure,
} from "@/features/network/components/NetworkOpsPrimitives";
import { promInstantVector, promQueryNetwork } from "@/features/vcenter/pages/vcenterPrometheusHelpers";
import NetworkConfigEditor from "@/features/network/pages/NetworkConfigEditor";

export type NetworkResourceView = "devices" | "interfaces" | "clients" | "wireless" | "connections" | "monitoring";
type ProviderKey = "all" | "ikuai" | "openwrt";

type NetworkDevice = SingletonNetworkDevice & {
  apiUrl?: string;
  host?: string;
  port?: number;
  authType?: string;
  username?: string;
  passwordSet?: boolean;
  privateKeySet?: boolean;
  notes?: string;
  updatedAt?: string;
};

export type NetworkProviderSummary = {
  provider: NetworkDeviceKind;
  label: string;
  configured: boolean;
  address: string;
  updatedAt?: string;
};

export type NetworkDeviceRow = {
  provider: NetworkDeviceKind;
  id: string;
  name: string;
  address: string;
  status: string;
  detail: string;
  updatedAt?: string;
  raw?: unknown;
};

export type NetworkInterfaceRow = {
  provider: NetworkDeviceKind;
  name: string;
  address: string;
  state: string;
  detail: string;
  rx?: number;
  tx?: number;
  rateUnit?: "kib" | "bytes";
  raw?: unknown;
};

export type NetworkClientRow = {
  provider: NetworkDeviceKind;
  name: string;
  ip: string;
  mac: string;
  detail: string;
  rx?: number;
  tx?: number;
  rateUnit?: "kib" | "bytes";
  raw?: unknown;
};

export type NetworkWirelessRow = {
  provider: NetworkDeviceKind;
  name: string;
  radio: string;
  state: string;
  signal: string;
  detail: string;
  raw?: unknown;
};

export type NetworkConnectionRow = {
  provider: NetworkDeviceKind;
  name: string;
  kind: string;
  value: string;
  detail: string;
  raw?: unknown;
};

export type NetworkMonitoringFamily = {
  provider: NetworkDeviceKind;
  family: string;
  ok?: boolean;
  detail: string;
  sampleTime?: string;
  hints?: string[];
  raw?: unknown;
};

export type NetworkConfigDomain =
  | "system"
  | "interfaces"
  | "clients"
  | "wireless"
  | "connections"
  | "monitoring"
  | "dhcp"
  | "dns"
  | "services";

export type NetworkConfigSnapshot = {
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  source?: string;
  capability?: string;
  checkedAt?: string;
  sections?: unknown[];
  errors?: string[];
  raw?: unknown;
};

export type NetworkChangeSet = {
  domain: NetworkConfigDomain;
  changes: Array<{
    operation: string;
    target?: string;
    section?: string;
    value?: string;
    funcName?: string;
    action?: string;
    param?: Record<string, unknown>;
  }>;
  reload?: string;
  confirm?: boolean;
};

export type NetworkChangePreview = {
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  capability?: string;
  commands?: string[];
  requests?: Array<{ func_name?: string; action?: string; param?: Record<string, unknown> }>;
  warnings?: string[];
  unsupported?: string[];
  requiresConfirmation?: boolean;
  raw?: unknown;
};

export type NetworkApplyResult = {
  ok?: boolean;
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  result?: unknown;
  results?: unknown[];
  preview?: NetworkChangePreview;
  checkedAt?: string;
};

export type NetworkMonitoringCoverage = {
  provider: NetworkDeviceKind;
  healthy: boolean;
  sampleTime?: string;
  families: NetworkMonitoringFamily[];
  missingHints?: string[];
};

export type IkuaiClientRow = {
  ip?: string;
  mac?: string;
  hostname?: string;
  comment?: string;
  clientType?: string;
  download?: number;
  upload?: number;
  connections?: number;
};

export type IkuaiMetricSource = "modern" | "legacy" | "unknown";

type IkuaiStreamResponse = {
  prometheusConfigured?: boolean;
  devices?: IkuaiClientRow[];
  exporterKind?: IkuaiMetricSource;
  note?: string;
  checkedAt?: string;
  queriesUsed?: Record<string, string>;
};

type IkuaiInterfaceMetricRow = {
  name: string;
  ip: string;
  mac: string;
  comment: string;
  download?: number;
  upload?: number;
};

type IkuaiInterfacesResult = {
  rows: IkuaiInterfaceMetricRow[];
  source: IkuaiMetricSource;
};

export type OpenWrtSystemSummary = {
  hostname: string;
  model: string;
  uptime: string;
  release: string;
};

type OpenWrtOverview = {
  board?: Record<string, unknown>;
  system?: Record<string, unknown>;
  network?: Record<string, unknown>;
  raw?: unknown;
};

type OpenWrtInterfaces = {
  interfaces?: Array<Record<string, unknown>>;
  raw?: unknown;
};

type OpenWrtClients = {
  leases?: Array<{ host?: string; ip?: string; mac?: string; expires?: string; source?: string }>;
  neighbors?: Array<{ ip?: string; dev?: string; mac?: string; state?: string; source?: string }>;
  raw?: unknown;
};

type OpenWrtWireless = {
  radios?: Array<Record<string, unknown>>;
  stations?: Array<{ interface?: string; mac?: string; signal?: unknown; rxRate?: unknown; txRate?: unknown }>;
  raw?: unknown;
};

type OpenWrtFirewall = {
  firewallConfig?: Array<{ key?: string; value?: string; package?: string; section?: string; option?: string }>;
  raw?: { ruleset?: string; [key: string]: unknown };
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
  source?: string;
  checkedAt?: string;
};

export type NetworkResourcePageProps = {
  view: NetworkResourceView;
};

const viewMeta: Record<
  NetworkResourceView,
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    empty: string;
  }
> = {
  devices: {
    title: "设备",
    description: "查看 iKuai 与 OpenWrt 接入状态、管理地址、监控覆盖和最近更新时间。",
    icon: Network,
    empty: "还没有接入网络设备。",
  },
  interfaces: {
    title: "接口",
    description: "聚合 iKuai 与 OpenWrt 接口、地址、状态和吞吐，来源只作为筛选条件。",
    icon: Cable,
    empty: "当前来源还没有接口数据。",
  },
  clients: {
    title: "终端",
    description: "统一查看 DHCP/邻居表、iKuai 终端流量、IP、MAC、主机名和备注。",
    icon: Users,
    empty: "当前来源还没有终端数据。",
  },
  wireless: {
    title: "无线",
    description: "查看 OpenWrt radio、SSID/接口、关联终端、信号和速率状态。",
    icon: Wifi,
    empty: "当前还没有无线数据。",
  },
  connections: {
    title: "连接",
    description: "汇总 OpenWrt 防火墙/连接跟踪线索和 iKuai 终端连接数。",
    icon: Activity,
    empty: "当前来源还没有连接数据。",
  },
  monitoring: {
    title: "监控",
    description: "检查 Prometheus 指标族、Exporter 类型和缺失提示，原始响应仅在管理员排障区展开。",
    icon: Gauge,
    empty: "当前来源还没有监控指标。",
  },
};

const providerLabels: Record<ProviderKey | NetworkDeviceKind, string> = {
  all: "全部来源",
  ikuai: "iKuai",
  openwrt: "OpenWrt",
};

const openWrtFamilyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

function promLabelEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function metricSelector(metric: string, device?: NetworkDevice, extra: string[] = []): string {
  const matchers = [...extra];
  if (device?.instanceLabel) matchers.push(`instance="${promLabelEscape(device.instanceLabel)}"`);
  if (device?.jobLabel) matchers.push(`job="${promLabelEscape(device.jobLabel)}"`);
  return matchers.length > 0 ? `${metric}{${matchers.join(",")}}` : metric;
}

function streamPath(device?: NetworkDevice): string {
  const scope = encodeURIComponent(device?.prometheusScope || "network");
  return `/api/network/ikuai-client-stream?scope=${scope}&unit=bytes`;
}

function rateUnit(source?: IkuaiMetricSource): "kib" | "bytes" {
  return source === "modern" ? "kib" : "bytes";
}

function providerTone(provider: NetworkDeviceKind): string {
  return provider === "ikuai"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-cyan-200 bg-cyan-50 text-cyan-800";
}

function statusTone(value: string): string {
  const v = value.toLowerCase();
  if (["online", "up", "已接入", "正常", "healthy", "ok", "可管理"].some((x) => v.includes(x))) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (["missing", "未配置", "缺失", "down", "error", "失败"].some((x) => v.includes(x))) {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function numberText(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "-";
}

function releaseText(value: unknown): string {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return [row.distribution, row.version].map((x) => networkText(x, "")).filter(Boolean).join(" ") || "-";
  }
  return networkText(value);
}

function formatIPv4List(value: unknown): string {
  if (!Array.isArray(value)) return "-";
  const rows = value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      const address = String(row.address ?? "").trim();
      const mask = String(row.mask ?? "").trim();
      return address ? `${address}${mask ? `/${mask}` : ""}` : "";
    })
    .filter(Boolean);
  return rows.length > 0 ? rows.join(", ") : "-";
}

function mapSystemSummary(data?: OpenWrtOverview): OpenWrtSystemSummary {
  const board = data?.board ?? {};
  const system = data?.system ?? {};
  return {
    hostname: networkText(board.hostname ?? system.hostname, "OpenWrt"),
    model: networkText(board.model ?? board.system),
    uptime: formatDurationSeconds(system.uptime),
    release: releaseText(board.release),
  };
}

function mapIkuaiInterfaces(data?: IkuaiInterfacesResult): NetworkInterfaceRow[] {
  const unit = rateUnit(data?.source);
  return (data?.rows ?? []).map((row) => ({
    provider: "ikuai",
    name: row.name,
    address: row.ip,
    state: "Prometheus",
    detail: row.comment || row.mac || "-",
    rx: row.download,
    tx: row.upload,
    rateUnit: unit,
    raw: row,
  }));
}

function mapOpenWrtInterfaces(data?: OpenWrtInterfaces): NetworkInterfaceRow[] {
  return (data?.interfaces ?? []).map((item) => {
    const name = networkText(item.name ?? item.interface ?? item.ifname, "unknown");
    const up = item.up === true || item.status === "up";
    return {
      provider: "openwrt",
      name,
      address: formatIPv4List(item["ipv4-address"]),
      state: up ? "up" : networkText(item.status ?? item.proto ?? "down"),
      detail: networkText(item.device ?? item.l3_device ?? item.proto),
      raw: item,
    };
  });
}

function clientDisplayName(row: IkuaiClientRow): string {
  return row.comment || row.hostname || row.ip || "未命名终端";
}

function mapIkuaiClients(data?: IkuaiStreamResponse): NetworkClientRow[] {
  const unit = rateUnit(data?.exporterKind);
  return (data?.devices ?? []).map((row) => ({
    provider: "ikuai",
    name: clientDisplayName(row),
    ip: networkText(row.ip),
    mac: networkText(row.mac),
    detail: row.connections != null ? `${row.connections} 连接` : networkText(row.clientType, "终端流"),
    rx: row.download,
    tx: row.upload,
    rateUnit: unit,
    raw: row,
  }));
}

function mapOpenWrtClients(data?: OpenWrtClients): NetworkClientRow[] {
  const leases = (data?.leases ?? []).map((lease) => ({
    provider: "openwrt" as const,
    name: lease.host || lease.ip || "DHCP 租约",
    ip: networkText(lease.ip),
    mac: networkText(lease.mac),
    detail: lease.expires ? `租约 ${lease.expires}` : networkText(lease.source, "DHCP"),
    raw: lease,
  }));
  const neighbors = (data?.neighbors ?? []).map((neighbor) => ({
    provider: "openwrt" as const,
    name: neighbor.dev || neighbor.ip || "邻居",
    ip: networkText(neighbor.ip),
    mac: networkText(neighbor.mac),
    detail: networkText(neighbor.state ?? neighbor.source, "邻居表"),
    raw: neighbor,
  }));
  return [...leases, ...neighbors];
}

function mapOpenWrtWireless(data?: OpenWrtWireless): NetworkWirelessRow[] {
  const radios = (data?.radios ?? []).map((radio) => ({
    provider: "openwrt" as const,
    name: networkText(radio.name ?? radio.section ?? radio.device, "radio"),
    radio: networkText(radio.path ?? radio.hwmode ?? radio.band),
    state: radio.disabled === true ? "disabled" : "enabled",
    signal: "-",
    detail: networkText(radio.channel ?? radio.country ?? radio.type),
    raw: radio,
  }));
  const stations = (data?.stations ?? []).map((station) => ({
    provider: "openwrt" as const,
    name: station.mac || "关联终端",
    radio: networkText(station.interface),
    state: "associated",
    signal: networkText(station.signal),
    detail: `RX ${numberText(station.rxRate)} / TX ${numberText(station.txRate)}`,
    raw: station,
  }));
  return [...radios, ...stations];
}

function mapOpenWrtConnections(data?: OpenWrtFirewall): NetworkConnectionRow[] {
  const configRows = (data?.firewallConfig ?? []).map((row) => ({
    provider: "openwrt" as const,
    name: row.section || row.key || "firewall",
    kind: row.package || "uci",
    value: row.value || row.option || "-",
    detail: row.key || row.option || "firewall config",
    raw: row,
  }));
  const ruleset = data?.raw?.ruleset;
  return ruleset
    ? [
        ...configRows,
        {
          provider: "openwrt" as const,
          name: "nft ruleset",
          kind: "ruleset",
          value: `${String(ruleset).split(/\r?\n/).filter(Boolean).length} 行`,
          detail: "OpenWrt 防火墙规则",
          raw: { ruleset },
        },
      ]
    : configRows;
}

function mapIkuaiConnections(data?: IkuaiStreamResponse): NetworkConnectionRow[] {
  return (data?.devices ?? [])
    .filter((row) => Number(row.connections ?? 0) > 0)
    .map((row) => ({
      provider: "ikuai" as const,
      name: clientDisplayName(row),
      kind: "终端连接",
      value: `${row.connections ?? 0}`,
      detail: `${networkText(row.ip)} / ${networkText(row.mac)}`,
      raw: row,
    }));
}

function mapMonitoringRows(
  ikuaiDevice?: NetworkDevice,
  ikuaiStream?: IkuaiStreamResponse,
  openWrtDevice?: NetworkDevice,
  openWrtStatus?: OpenWrtStatus
): NetworkMonitoringFamily[] {
  const rows: NetworkMonitoringFamily[] = [];
  if (ikuaiDevice) {
    rows.push({
      provider: "ikuai",
      family: "终端流",
      ok: ikuaiStream?.prometheusConfigured,
      detail: ikuaiStream?.exporterKind ? `Exporter: ${ikuaiStream.exporterKind}` : deviceQueryHint(ikuaiDevice),
      sampleTime: ikuaiStream?.checkedAt,
      hints: ikuaiStream?.note ? [ikuaiStream.note] : undefined,
      raw: ikuaiStream,
    });
  }
  if (openWrtDevice) {
    for (const [key, label] of openWrtFamilyLabels) {
      rows.push({
        provider: "openwrt",
        family: label,
        ok: Boolean(openWrtStatus?.families?.[key]),
        detail: openWrtStatus?.families?.[key] ? "已发现指标" : "缺失",
        sampleTime: openWrtStatus?.checkedAt,
        hints: openWrtStatus?.missingHints,
        raw: openWrtStatus,
      });
    }
  }
  return rows;
}

function providerFilterFromParam(value: string | null): ProviderKey {
  return value === "ikuai" || value === "openwrt" ? value : "all";
}

function rowSearchText(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  return Object.values(row as Record<string, unknown>)
    .map((value) => {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
      return "";
    })
    .join(" ")
    .toLowerCase();
}

function SummaryChip({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function ProviderBadge({ provider }: { provider: NetworkDeviceKind }) {
  return (
    <Badge variant="outline" className={cn("font-normal", providerTone(provider))}>
      {providerLabels[provider]}
    </Badge>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", statusTone(value))}>
      {value}
    </Badge>
  );
}

function CellText({ value, mono = false }: { value: React.ReactNode; mono?: boolean }) {
  return <span className={cn("block max-w-[260px] truncate", mono && "font-mono text-xs")}>{value}</span>;
}

function DeviceRows({ rows }: { rows: NetworkDeviceRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <TableRow key={`${row.provider}:${row.id}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.name} /></TableCell>
          <TableCell><CellText value={row.address} mono /></TableCell>
          <TableCell><StatusBadge value={row.status} /></TableCell>
          <TableCell className="text-sm text-slate-600"><CellText value={row.detail} /></TableCell>
          <TableCell className="text-xs text-slate-500">{row.updatedAt ? formatDateTime(row.updatedAt) : "-"}</TableCell>
          <TableCell className="text-right">
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" asChild>
              <Link to={`/cluster/network/config`}>
                配置
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function InterfaceRows({ rows }: { rows: NetworkInterfaceRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={`${row.provider}:${row.name}:${index}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.name} /></TableCell>
          <TableCell><CellText value={row.address} mono /></TableCell>
          <TableCell><StatusBadge value={row.state} /></TableCell>
          <TableCell className="text-sm text-slate-600"><CellText value={row.detail} /></TableCell>
          <TableCell className="text-xs tabular-nums text-slate-600">
            RX {formatRate(row.rx, row.rateUnit)} / TX {formatRate(row.tx, row.rateUnit)}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ClientRows({ rows }: { rows: NetworkClientRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={`${row.provider}:${row.ip}:${row.mac}:${index}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.name} /></TableCell>
          <TableCell><CellText value={row.ip} mono /></TableCell>
          <TableCell><CellText value={row.mac} mono /></TableCell>
          <TableCell className="text-sm text-slate-600"><CellText value={row.detail} /></TableCell>
          <TableCell className="text-xs tabular-nums text-slate-600">
            RX {formatRate(row.rx, row.rateUnit)} / TX {formatRate(row.tx, row.rateUnit)}
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function WirelessRows({ rows }: { rows: NetworkWirelessRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={`${row.provider}:${row.name}:${index}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.name} /></TableCell>
          <TableCell><CellText value={row.radio} /></TableCell>
          <TableCell><StatusBadge value={row.state} /></TableCell>
          <TableCell><CellText value={row.signal} mono /></TableCell>
          <TableCell className="text-sm text-slate-600"><CellText value={row.detail} /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function ConnectionRows({ rows }: { rows: NetworkConnectionRow[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={`${row.provider}:${row.name}:${index}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.name} /></TableCell>
          <TableCell><CellText value={row.kind} /></TableCell>
          <TableCell><CellText value={row.value} mono /></TableCell>
          <TableCell colSpan={2} className="text-sm text-slate-600"><CellText value={row.detail} /></TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MonitoringRows({ rows }: { rows: NetworkMonitoringFamily[] }) {
  return (
    <>
      {rows.map((row, index) => (
        <TableRow key={`${row.provider}:${row.family}:${index}`} className="border-slate-100">
          <TableCell><ProviderBadge provider={row.provider} /></TableCell>
          <TableCell className="font-medium text-slate-900"><CellText value={row.family} /></TableCell>
          <TableCell><StatusBadge value={row.ok === true ? "正常" : row.ok === false ? "缺失" : "待确认"} /></TableCell>
          <TableCell colSpan={3} className="text-sm text-slate-600">
            <div className="min-w-0">
              <CellText value={row.detail} />
              {row.sampleTime ? <p className="mt-1 text-xs text-slate-500">样本：{formatDateTime(row.sampleTime)}</p> : null}
              {row.hints?.length ? <p className="mt-1 line-clamp-2 text-xs text-amber-700">{row.hints.join("；")}</p> : null}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

const NetworkResourcePage: React.FC<NetworkResourcePageProps> = ({ view }) => {
  const meta = viewMeta[view];
  const Icon = meta.icon;
  const { status } = useAuth();
  const canViewRaw = status?.role === "admin";
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const [params, setParams] = useSearchParams();
  const providerParam = providerFilterFromParam(params.get("provider"));
  const [query, setQuery] = useState("");
  const showIkuai = providerParam === "all" || providerParam === "ikuai";
  const showOpenWrt = providerParam === "all" || providerParam === "openwrt";

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const devices = useMemo(() => devicesQ.data?.devices ?? [], [devicesQ.data?.devices]);
  const ikuaiDevice = useMemo(() => singleNetworkDeviceByKind(devices, "ikuai"), [devices]);
  const openWrtDevice = useMemo(() => singleNetworkDeviceByKind(devices, "openwrt"), [devices]);
  const activeOpenWrtId = openWrtDevice?.id ?? "";

  const ikuaiStreamQ = useQuery({
    queryKey: ["network-resource", "ikuai-stream", ikuaiDevice?.id, ikuaiDevice?.prometheusScope],
    queryFn: ({ signal }) => apiGetJson<IkuaiStreamResponse>(streamPath(ikuaiDevice), { signal }),
    enabled: Boolean(showIkuai && ikuaiDevice && ["devices", "clients", "connections", "monitoring"].includes(view)),
    refetchInterval: showIkuai && ikuaiDevice ? 20_000 : false,
  });

  const ikuaiInterfacesQ = useQuery({
    queryKey: ["network-resource", "ikuai-interfaces", ikuaiDevice?.id, ikuaiDevice?.instanceLabel, ikuaiDevice?.jobLabel],
    queryFn: async ({ signal }) => {
      const infoRows = promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_info", ikuaiDevice), { signal }));
      const modernRx = promInstantVector(
        await promQueryNetwork(metricSelector("ikuai_network_recv_kbytes_per_second", ikuaiDevice, ['id=~"iface/.*"']), { signal })
      );
      const modernTx = promInstantVector(
        await promQueryNetwork(metricSelector("ikuai_network_send_kbytes_per_second", ikuaiDevice, ['id=~"iface/.*"']), { signal })
      );
      const source: IkuaiMetricSource = modernRx.length > 0 || modernTx.length > 0 ? "modern" : "legacy";
      const rxRows =
        source === "modern"
          ? modernRx
          : promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_stream_download", ikuaiDevice), { signal }));
      const txRows =
        source === "modern"
          ? modernTx
          : promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_stream_upload", ikuaiDevice), { signal }));
      const rows = new Map<string, IkuaiInterfaceMetricRow>();
      const ensure = (name: string) => {
        const key = name || "unknown";
        if (!rows.has(key)) rows.set(key, { name: key, ip: "-", mac: "-", comment: "-" });
        return rows.get(key)!;
      };
      for (const item of infoRows) {
        const name = item.metric.interface || item.metric.name || item.metric.ifname || "unknown";
        const row = ensure(name);
        row.ip = networkText(item.metric.ip_addr);
        row.mac = networkText(item.metric.mac);
        row.comment = networkText(item.metric.comment || item.metric.name_cn || item.metric.name);
      }
      for (const item of rxRows) {
        const raw = item.metric.interface || item.metric.id?.replace(/^iface\//, "") || item.metric.name || "unknown";
        ensure(raw).download = item.value;
      }
      for (const item of txRows) {
        const raw = item.metric.interface || item.metric.id?.replace(/^iface\//, "") || item.metric.name || "unknown";
        ensure(raw).upload = item.value;
      }
      return { rows: Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name)), source };
    },
    enabled: Boolean(showIkuai && ikuaiDevice && view === "interfaces"),
    refetchInterval: showIkuai && ikuaiDevice && view === "interfaces" ? 20_000 : false,
  });

  const openWrtExporterQ = useQuery({
    queryKey: ["network-resource", "openwrt-exporter", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtStatus>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/exporter-status`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && ["devices", "monitoring"].includes(view)),
    staleTime: 30_000,
  });

  const openWrtOverviewQ = useQuery({
    queryKey: ["network-resource", "openwrt-overview", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtOverview>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/openwrt/overview`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && view === "devices"),
    staleTime: 30_000,
  });

  const openWrtInterfacesQ = useQuery({
    queryKey: ["network-resource", "openwrt-interfaces", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtInterfaces>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/openwrt/interfaces`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && view === "interfaces"),
    refetchInterval: showOpenWrt && activeOpenWrtId && view === "interfaces" ? 30_000 : false,
  });

  const openWrtClientsQ = useQuery({
    queryKey: ["network-resource", "openwrt-clients", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtClients>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/openwrt/clients`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && view === "clients"),
    refetchInterval: showOpenWrt && activeOpenWrtId && view === "clients" ? 30_000 : false,
  });

  const openWrtWirelessQ = useQuery({
    queryKey: ["network-resource", "openwrt-wireless", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtWireless>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/openwrt/wireless`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && view === "wireless"),
    refetchInterval: showOpenWrt && activeOpenWrtId && view === "wireless" ? 30_000 : false,
  });

  const openWrtFirewallQ = useQuery({
    queryKey: ["network-resource", "openwrt-firewall", activeOpenWrtId],
    queryFn: ({ signal }) => apiGetJson<OpenWrtFirewall>(`/api/network/devices/${encodeURIComponent(activeOpenWrtId)}/openwrt/firewall`, { signal }),
    enabled: Boolean(showOpenWrt && activeOpenWrtId && view === "connections"),
    staleTime: 30_000,
  });

  const providers = useMemo<NetworkProviderSummary[]>(
    () => [
      {
        provider: "ikuai",
        label: "iKuai",
        configured: Boolean(ikuaiDevice),
        address: deviceQueryHint(ikuaiDevice),
        updatedAt: ikuaiDevice?.updatedAt,
      },
      {
        provider: "openwrt",
        label: "OpenWrt",
        configured: Boolean(openWrtDevice),
        address: openWrtDevice?.host || openWrtDevice?.apiUrl || "未配置",
        updatedAt: openWrtDevice?.updatedAt,
      },
    ],
    [ikuaiDevice, openWrtDevice]
  );

  const deviceRows = useMemo<NetworkDeviceRow[]>(() => {
    const rows: NetworkDeviceRow[] = [];
    if (showIkuai && ikuaiDevice) {
      rows.push({
        provider: "ikuai",
        id: ikuaiDevice.id,
        name: ikuaiDevice.name || "iKuai",
        address: deviceQueryHint(ikuaiDevice),
        status: ikuaiStreamQ.data?.prometheusConfigured === false ? "指标缺失" : "已接入",
        detail: ikuaiStreamQ.data?.exporterKind ? `Exporter ${ikuaiStreamQ.data.exporterKind}` : "Prometheus 数据源",
        updatedAt: ikuaiDevice.updatedAt,
        raw: { device: ikuaiDevice, stream: ikuaiStreamQ.data },
      });
    }
    if (showOpenWrt && openWrtDevice) {
      const summary = mapSystemSummary(openWrtOverviewQ.data);
      const ready = openWrtExporterQ.data?.families
        ? openWrtFamilyLabels.filter(([key]) => Boolean(openWrtExporterQ.data?.families?.[key])).length
        : 0;
      rows.push({
        provider: "openwrt",
        id: openWrtDevice.id,
        name: openWrtDevice.name || summary.hostname || "OpenWrt",
        address: openWrtDevice.host || openWrtDevice.apiUrl || "-",
        status: openWrtDevice.passwordSet || openWrtDevice.privateKeySet ? "SSH 可管理" : "缺少凭据",
        detail: `${summary.model} / 指标 ${ready}/${openWrtFamilyLabels.length}`,
        updatedAt: openWrtDevice.updatedAt,
        raw: { device: openWrtDevice, overview: openWrtOverviewQ.data, exporter: openWrtExporterQ.data },
      });
    }
    return rows;
  }, [ikuaiDevice, ikuaiStreamQ.data, openWrtDevice, openWrtExporterQ.data, openWrtOverviewQ.data, showIkuai, showOpenWrt]);

  const interfaceRows = useMemo(
    () => [...(showIkuai ? mapIkuaiInterfaces(ikuaiInterfacesQ.data) : []), ...(showOpenWrt ? mapOpenWrtInterfaces(openWrtInterfacesQ.data) : [])],
    [ikuaiInterfacesQ.data, openWrtInterfacesQ.data, showIkuai, showOpenWrt]
  );
  const clientRows = useMemo(
    () => [...(showIkuai ? mapIkuaiClients(ikuaiStreamQ.data) : []), ...(showOpenWrt ? mapOpenWrtClients(openWrtClientsQ.data) : [])],
    [ikuaiStreamQ.data, openWrtClientsQ.data, showIkuai, showOpenWrt]
  );
  const wirelessRows = useMemo(
    () => (showOpenWrt ? mapOpenWrtWireless(openWrtWirelessQ.data) : []),
    [openWrtWirelessQ.data, showOpenWrt]
  );
  const connectionRows = useMemo(
    () => [...(showIkuai ? mapIkuaiConnections(ikuaiStreamQ.data) : []), ...(showOpenWrt ? mapOpenWrtConnections(openWrtFirewallQ.data) : [])],
    [ikuaiStreamQ.data, openWrtFirewallQ.data, showIkuai, showOpenWrt]
  );
  const monitoringRows = useMemo(
    () =>
      mapMonitoringRows(
        showIkuai ? ikuaiDevice : undefined,
        showIkuai ? ikuaiStreamQ.data : undefined,
        showOpenWrt ? openWrtDevice : undefined,
        showOpenWrt ? openWrtExporterQ.data : undefined
      ),
    [ikuaiDevice, ikuaiStreamQ.data, openWrtDevice, openWrtExporterQ.data, showIkuai, showOpenWrt]
  );

  const rows = useMemo(() => {
    if (view === "devices") return deviceRows;
    if (view === "interfaces") return interfaceRows;
    if (view === "clients") return clientRows;
    if (view === "wireless") return wirelessRows;
    if (view === "connections") return connectionRows;
    return monitoringRows;
  }, [clientRows, connectionRows, deviceRows, interfaceRows, monitoringRows, view, wirelessRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (providerParam !== "all" && row.provider !== providerParam) return false;
      if (!q) return true;
      return rowSearchText(row).includes(q);
    });
  }, [providerParam, query, rows]);

  const errors = [
    devicesQ.error,
    ikuaiStreamQ.error,
    ikuaiInterfacesQ.error,
    openWrtExporterQ.error,
    openWrtOverviewQ.error,
    openWrtInterfacesQ.error,
    openWrtClientsQ.error,
    openWrtWirelessQ.error,
    openWrtFirewallQ.error,
  ]
    .filter(Boolean)
    .map((error) => (error instanceof Error ? error.message : String(error)));

  const loading =
    devicesQ.isLoading ||
    ikuaiStreamQ.isLoading ||
    ikuaiInterfacesQ.isLoading ||
    openWrtExporterQ.isLoading ||
    openWrtOverviewQ.isLoading ||
    openWrtInterfacesQ.isLoading ||
    openWrtClientsQ.isLoading ||
    openWrtWirelessQ.isLoading ||
    openWrtFirewallQ.isLoading;

  const providerCount = (provider: NetworkDeviceKind) => rows.filter((row) => row.provider === provider).length;
  const colSpan = view === "devices" ? 7 : 6;

  const setProvider = (provider: ProviderKey) => {
    const next = new URLSearchParams(params);
    if (provider === "all") next.delete("provider");
    else next.set("provider", provider);
    setParams(next, { replace: true });
  };

  const refresh = () => {
    void devicesQ.refetch();
    void ikuaiStreamQ.refetch();
    void ikuaiInterfacesQ.refetch();
    void openWrtExporterQ.refetch();
    void openWrtOverviewQ.refetch();
    void openWrtInterfacesQ.refetch();
    void openWrtClientsQ.refetch();
    void openWrtWirelessQ.refetch();
    void openWrtFirewallQ.refetch();
  };

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network Resource</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Icon className="h-6 w-6 text-cyan-700" />
              {meta.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{meta.description}</p>
          </div>
          <div className="grid grid-cols-1 gap-2 text-left sm:min-w-[360px] sm:grid-cols-3 sm:text-right">
            <SummaryChip label="总数" value={rows.length} />
            <SummaryChip label="iKuai" value={providerCount("ikuai")} />
            <SummaryChip label="OpenWrt" value={providerCount("openwrt")} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {providers.map((provider) => (
          <div key={provider.provider} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{provider.label}</p>
                <p className="mt-1 truncate text-xs text-slate-500" title={provider.address}>{provider.address}</p>
              </div>
              <ProviderBadge provider={provider.provider} />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {provider.configured ? `最近更新：${provider.updatedAt ? formatDateTime(provider.updatedAt) : "-"}` : "未接入，前往配置页维护"}
            </p>
          </div>
        ))}
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "ikuai", "openwrt"] as ProviderKey[]).map((provider) => {
            const active = providerParam === provider;
            return (
              <button
                key={provider}
                type="button"
                onClick={() => setProvider(provider)}
                className={cn(
                  "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors",
                  active
                    ? "border-cyan-200 bg-cyan-50 text-cyan-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {providerLabels[provider]}
              </button>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:min-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              aria-label="搜索网络资源"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、IP、MAC、接口"
              className="h-9 border-slate-200 pl-9"
            />
          </div>
          <NetworkConfigEditor view={view} provider={providerParam} devices={devices} canWrite={canWrite} canViewRaw={canViewRaw} />
          <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={refresh}>
            <RefreshCw className={cn("h-4 w-4", loading ? "animate-spin" : "")} />
            刷新
          </Button>
        </div>
      </section>

      {providers.every((provider) => !provider.configured) && !devicesQ.isLoading ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">还没有接入网络来源</p>
          <p className="mt-2 text-sm leading-6 text-slate-500">先在配置页保存 iKuai 或 OpenWrt，资源对象视图会自动启用。</p>
          <Button asChild className="mt-4 bg-cyan-700 hover:bg-cyan-800">
            <Link to="/cluster/network/config">打开配置</Link>
          </Button>
        </div>
      ) : null}

      <NetworkErrorList errors={errors} />

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                {view === "devices" ? (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">名称</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">地址/数据源</TableHead>
                    <TableHead className="font-semibold text-slate-800">状态</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">摘要</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">最近更新</TableHead>
                    <TableHead className="w-[90px] text-right font-semibold text-slate-800">操作</TableHead>
                  </>
                ) : view === "interfaces" ? (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">接口</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">地址</TableHead>
                    <TableHead className="font-semibold text-slate-800">状态</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">说明</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">吞吐</TableHead>
                  </>
                ) : view === "clients" ? (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">终端</TableHead>
                    <TableHead className="min-w-[140px] font-semibold text-slate-800">IP</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">MAC</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">说明</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">流量</TableHead>
                  </>
                ) : view === "wireless" ? (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">对象</TableHead>
                    <TableHead className="min-w-[150px] font-semibold text-slate-800">接口/Radio</TableHead>
                    <TableHead className="font-semibold text-slate-800">状态</TableHead>
                    <TableHead className="min-w-[120px] font-semibold text-slate-800">信号</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">说明</TableHead>
                  </>
                ) : view === "connections" ? (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[180px] font-semibold text-slate-800">对象</TableHead>
                    <TableHead className="min-w-[140px] font-semibold text-slate-800">类型</TableHead>
                    <TableHead className="min-w-[140px] font-semibold text-slate-800">值</TableHead>
                    <TableHead colSpan={2} className="min-w-[220px] font-semibold text-slate-800">说明</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                    <TableHead className="min-w-[160px] font-semibold text-slate-800">指标族</TableHead>
                    <TableHead className="font-semibold text-slate-800">状态</TableHead>
                    <TableHead colSpan={3} className="min-w-[260px] font-semibold text-slate-800">说明</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={colSpan} label="正在加载网络资源..." />
              ) : filteredRows.length === 0 ? (
                <EmptyTableRow
                  colSpan={colSpan}
                  label={query || providerParam !== "all" ? "没有匹配当前筛选条件的资源。" : meta.empty}
                />
              ) : view === "devices" ? (
                <DeviceRows rows={filteredRows as NetworkDeviceRow[]} />
              ) : view === "interfaces" ? (
                <InterfaceRows rows={filteredRows as NetworkInterfaceRow[]} />
              ) : view === "clients" ? (
                <ClientRows rows={filteredRows as NetworkClientRow[]} />
              ) : view === "wireless" ? (
                <WirelessRows rows={filteredRows as NetworkWirelessRow[]} />
              ) : view === "connections" ? (
                <ConnectionRows rows={filteredRows as NetworkConnectionRow[]} />
              ) : (
                <MonitoringRows rows={filteredRows as NetworkMonitoringFamily[]} />
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <RawDataDisclosure
        visible={canViewRaw}
        title="原始数据"
        value={{
          providerParam,
          devices: devicesQ.data,
          ikuaiStream: ikuaiStreamQ.data,
          ikuaiInterfaces: ikuaiInterfacesQ.data,
          openwrtExporter: openWrtExporterQ.data,
          openwrtOverview: openWrtOverviewQ.data,
          openwrtInterfaces: openWrtInterfacesQ.data,
          openwrtClients: openWrtClientsQ.data,
          openwrtWireless: openWrtWirelessQ.data,
          openwrtFirewall: openWrtFirewallQ.data,
        }}
      />
    </div>
  );
};

export default NetworkResourcePage;
