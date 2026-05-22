import { deviceQueryHint } from "@/features/network/components/networkDeviceSingleton";
import { formatDateTime, formatDurationSeconds, networkText } from "@/features/network/components/NetworkOpsPrimitives";
import type {
  IkuaiClientRow,
  IkuaiInterfacesResult,
  IkuaiMetricSource,
  IkuaiStreamResponse,
  NetworkClientRow,
  NetworkDevice,
  NetworkDeviceRow,
  NetworkFirewallGroup,
  NetworkFirewallRow,
  NetworkInterfaceRow,
  NetworkMonitoringCoverage,
  NetworkMonitoringFamily,
  NetworkProviderSummary,
  NetworkWirelessRow,
  OpenWrtClients,
  OpenWrtFamilies,
  OpenWrtFirewall,
  OpenWrtFirewallEntry,
  OpenWrtInterfaces,
  OpenWrtOverview,
  OpenWrtStatus,
  OpenWrtWireless,
} from "./networkTypes";

export type OpenWrtSystemSummary = {
  hostname: string;
  model: string;
  uptime: string;
  release: string;
};

type OpenWrtFirewallSection = {
  section: string;
  type: string;
  options: Record<string, string>;
  entries: OpenWrtFirewallEntry[];
};

type OpenWrtInterfacesMapperShape = {
  interfaceDump?: { interface?: Array<Record<string, unknown>> };
};

export const openWrtFamilyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

export function numberText(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "-";
}

export function optionalNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function releaseText(value: unknown): string {
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return [row.distribution, row.version].map((x) => networkText(x, "")).filter(Boolean).join(" ") || "-";
  }
  return networkText(value);
}

function rateUnit(source?: IkuaiMetricSource): "kib" | "bytes" {
  return source === "modern" ? "kib" : "bytes";
}

export function formatIPv4List(value: unknown): string {
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

function formatAddrInfoList(value: unknown): string {
  if (!Array.isArray(value)) return "-";
  const rows = value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      if (row.family && row.family !== "inet") return "";
      const address = String(row.local ?? row.address ?? "").trim();
      const prefix = String(row.prefixlen ?? row.mask ?? "").trim();
      return address ? `${address}${prefix ? `/${prefix}` : ""}` : "";
    })
    .filter(Boolean);
  return rows.length > 0 ? rows.join(", ") : "-";
}

function inferInterfaceGroup(name: string, detail: string): string {
  const text = `${name} ${detail}`.toLowerCase();
  if (text.includes("wan") || text.includes("pppoe")) return "WAN";
  if (text.includes("lan") || text.includes("br-lan")) return "LAN";
  if (text.includes("br-") || text.includes("bridge")) return "bridge";
  if (/(\beth|^eth|\ben|^en)/.test(text)) return "物理口";
  return "逻辑口";
}

export function mapSystemSummary(data?: OpenWrtOverview): OpenWrtSystemSummary {
  const board = data?.board ?? {};
  const system = data?.system ?? {};
  return {
    hostname: networkText(board.hostname ?? system.hostname, "OpenWrt"),
    model: networkText(board.model ?? board.system),
    uptime: formatDurationSeconds(system.uptime),
    release: releaseText(board.release),
  };
}

export function mapProviderSummaries(ikuaiDevice?: NetworkDevice, openWrtDevice?: NetworkDevice): NetworkProviderSummary[] {
  return [
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
  ];
}

export function mapDeviceRows(input: {
  ikuaiDevice?: NetworkDevice;
  ikuaiStream?: IkuaiStreamResponse;
  openWrtDevice?: NetworkDevice;
  openWrtOverview?: OpenWrtOverview;
  openWrtStatus?: OpenWrtStatus;
  showIkuai: boolean;
  showOpenWrt: boolean;
}): NetworkDeviceRow[] {
  const rows: NetworkDeviceRow[] = [];
  if (input.showIkuai && input.ikuaiDevice) {
    rows.push({
      provider: "ikuai",
      id: input.ikuaiDevice.id,
      name: input.ikuaiDevice.name || "iKuai",
      address: deviceQueryHint(input.ikuaiDevice),
      status: input.ikuaiStream?.prometheusConfigured === false ? "指标缺失" : "已接入",
      detail: input.ikuaiStream?.exporterKind ? `Exporter ${input.ikuaiStream.exporterKind}` : "Prometheus 数据源",
      updatedAt: input.ikuaiDevice.updatedAt,
      raw: { device: input.ikuaiDevice, stream: input.ikuaiStream },
    });
  }
  if (input.showOpenWrt && input.openWrtDevice) {
    const summary = mapSystemSummary(input.openWrtOverview);
    const ready = input.openWrtStatus?.families
      ? openWrtFamilyLabels.filter(([key]) => Boolean(input.openWrtStatus?.families?.[key])).length
      : 0;
    rows.push({
      provider: "openwrt",
      id: input.openWrtDevice.id,
      name: input.openWrtDevice.name || summary.hostname || "OpenWrt",
      address: input.openWrtDevice.host || input.openWrtDevice.apiUrl || "-",
      status: input.openWrtDevice.passwordSet || input.openWrtDevice.privateKeySet ? "SSH 可管理" : "缺少凭据",
      detail: `${summary.model} / 指标 ${ready}/${openWrtFamilyLabels.length}`,
      updatedAt: input.openWrtDevice.updatedAt,
      raw: { device: input.openWrtDevice, overview: input.openWrtOverview, exporter: input.openWrtStatus },
    });
  }
  return rows;
}

export function mapIkuaiInterfaces(data?: IkuaiInterfacesResult): NetworkInterfaceRow[] {
  const unit = rateUnit(data?.source);
  return (data?.rows ?? []).map((row) => ({
    provider: "ikuai",
    name: row.name,
    group: inferInterfaceGroup(row.name, row.comment),
    address: row.ip,
    state: "Prometheus",
    detail: row.comment || row.mac || "-",
    rx: row.download,
    tx: row.upload,
    rateUnit: unit,
    raw: row,
  }));
}

export function mapOpenWrtInterfaces(data?: OpenWrtInterfaces): NetworkInterfaceRow[] {
  const items = data?.interfaceDump?.interface?.length
    ? data.interfaceDump.interface
    : data?.interfaces?.length
      ? data.interfaces
      : (data?.ipAddr ?? []);
  return items.map((item) => {
    const name = networkText(item.name ?? item.interface ?? item.ifname, "unknown");
    const up = item.up === true || item.up === 1 || item.status === "up" || item.operstate === "UP";
    const address = formatIPv4List(item["ipv4-address"]);
    const detail = networkText(item.device ?? item.l3_device ?? item.ifname ?? item.proto ?? item.link_type);
    return {
      provider: "openwrt",
      name,
      group: inferInterfaceGroup(name, detail),
      address: address !== "-" ? address : formatAddrInfoList(item.addr_info),
      state: up ? "up" : networkText(item.status ?? item.operstate ?? item.proto ?? "down"),
      detail,
      rx: optionalNumber(item.rxBytesPerSecond),
      tx: optionalNumber(item.txBytesPerSecond),
      rateUnit: item.rxBytesPerSecond != null || item.txBytesPerSecond != null ? "bytes" : undefined,
      raw: item,
    };
  });
}

function clientDisplayName(row: IkuaiClientRow): string {
  return row.comment || row.hostname || row.ip || "未命名终端";
}

export function mapIkuaiClients(data?: IkuaiStreamResponse): NetworkClientRow[] {
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

export function mapOpenWrtClients(data?: OpenWrtClients): NetworkClientRow[] {
  const rows = new Map<string, NetworkClientRow>();
  const keyFor = (ip?: string, mac?: string) => `${ip || "-"}|${mac || "-"}`;
  for (const lease of data?.leases ?? []) {
    const key = keyFor(lease.ip, lease.mac);
    rows.set(key, {
      provider: "openwrt",
      name: lease.host || lease.ip || "DHCP 租约",
      ip: networkText(lease.ip),
      mac: networkText(lease.mac),
      detail: lease.expires ? `DHCP 租约 ${lease.expires}` : networkText(lease.source, "DHCP"),
      raw: { lease },
    });
  }
  for (const neighbor of data?.neighbors ?? []) {
    const key = keyFor(neighbor.ip, neighbor.mac);
    const existing = rows.get(key);
    const detail = `邻居 ${networkText(neighbor.state ?? neighbor.source)}`;
    if (existing) {
      existing.detail = `${existing.detail} / ${detail}`;
      existing.raw = { ...(existing.raw as Record<string, unknown>), neighbor };
    } else {
      rows.set(key, {
        provider: "openwrt",
        name: neighbor.ip || neighbor.dev || "邻居",
        ip: networkText(neighbor.ip),
        mac: networkText(neighbor.mac),
        detail,
        raw: { neighbor },
      });
    }
  }
  return Array.from(rows.values());
}

export function mapOpenWrtWireless(data?: OpenWrtWireless): NetworkWirelessRow[] {
  const radios = (data?.radios ?? []).map((radio) => ({
    provider: "openwrt" as const,
    category: "radio" as const,
    name: networkText(radio.name ?? radio.section ?? radio.device, "Radio"),
    radio: networkText(radio.path ?? radio.hwmode ?? radio.band),
    state: radio.disabled === true || radio.disabled === "1" ? "disabled" : "enabled",
    signal: "-",
    detail: `信道 ${networkText(radio.channel)} / 频段 ${networkText(radio.band ?? radio.hwmode)} / 加密 ${networkText(radio.encryption)}`,
    raw: radio,
  }));
  const ifaces = (data?.ifaces ?? []).map((iface) => {
    const row = typeof iface === "string" ? { name: iface } : iface;
    return {
      provider: "openwrt" as const,
      category: "ssid" as const,
      name: networkText(row.ssid ?? row.name ?? row.section, "SSID"),
      radio: networkText(row.device ?? row.ifname ?? row.network),
      state: row.disabled === true || row.disabled === "1" ? "disabled" : "enabled",
      signal: "-",
      detail: `接口 ${networkText(row.ifname)} / 加密 ${networkText(row.encryption)}`,
      raw: row,
    };
  });
  const stations = (data?.stations ?? []).map((station) => ({
    provider: "openwrt" as const,
    category: "station" as const,
    name: station.mac || "关联终端",
    radio: networkText(station.interface),
    state: "associated",
    signal: networkText(station.signal),
    detail: `RX ${numberText(station.rxRate)} / TX ${numberText(station.txRate)}`,
    raw: station,
  }));
  return [...radios, ...ifaces, ...stations];
}

function cleanUciText(value: unknown, fallback = "-"): string {
  const text = String(value ?? "").replace(/'/g, "").trim();
  return text || fallback;
}

function uciEnabled(value: unknown): boolean {
  return ["1", "true", "yes", "on"].includes(cleanUciText(value, "").toLowerCase());
}

function firewallPolicy(options: Record<string, string>): string {
  return `入 ${cleanUciText(options.input)} / 出 ${cleanUciText(options.output)} / 转 ${cleanUciText(options.forward)}`;
}

function firewallOptionSummary(options: Record<string, string>, keys: string[]): string {
  const parts = keys
    .map((key) => {
      const value = cleanUciText(options[key], "");
      return value ? `${key}: ${value}` : "";
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : "-";
}

function firewallTypeLabel(type: string): string {
  if (type === "defaults") return "默认策略";
  if (type === "zone") return "防火墙区域";
  if (type === "forwarding") return "区域转发";
  if (type === "redirect") return "端口转发";
  if (type === "rule") return "访问规则";
  if (type === "nat") return "NAT 规则";
  if (type === "include") return "包含脚本";
  return "防火墙配置";
}

export function groupOpenWrtFirewallSections(entries: OpenWrtFirewallEntry[] = []): OpenWrtFirewallSection[] {
  const sections = new Map<string, OpenWrtFirewallSection>();
  for (const entry of entries) {
    const sectionName = cleanUciText(entry.section, "");
    if (!sectionName) continue;
    const existing =
      sections.get(sectionName) ??
      ({
        section: sectionName,
        type: "",
        options: {},
        entries: [],
      } satisfies OpenWrtFirewallSection);
    existing.entries.push(entry);
    if (!entry.option && entry.value) existing.type = cleanUciText(entry.value, existing.type);
    if (entry.option) existing.options[entry.option] = cleanUciText(entry.value, "");
    sections.set(sectionName, existing);
  }
  const typeOrder = ["defaults", "zone", "forwarding", "redirect", "rule", "nat", "include"];
  return Array.from(sections.values())
    .map((section) => ({ ...section, type: section.type || "unknown" }))
    .sort((a, b) => {
      const typeDiff = typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type);
      if (typeDiff !== 0) return typeDiff;
      return a.section.localeCompare(b.section);
    });
}

export function summarizeOpenWrtFirewallSection(section: OpenWrtFirewallSection): NetworkFirewallRow {
  const options = section.options;
  const type = section.type;
  const label = firewallTypeLabel(type);
  if (type === "defaults") {
    return {
      provider: "openwrt",
      name: "默认防火墙策略",
      kind: label,
      value: firewallPolicy(options),
      detail: `SYN flood ${uciEnabled(options.syn_flood) ? "已防护" : "未启用"}，full cone ${cleanUciText(options.fullcone, "未启用")}`,
      raw: section,
    };
  }
  if (type === "zone") {
    const name = cleanUciText(options.name, "未命名区域");
    const network = cleanUciText(options.network);
    const nat = uciEnabled(options.masq);
    return {
      provider: "openwrt",
      name: `区域 ${name}`,
      kind: nat ? "防火墙区域 / 源 NAT" : label,
      value: network,
      detail: `${firewallPolicy(options)}${nat ? " / 已启用 masquerade" : ""}`,
      raw: section,
    };
  }
  if (type === "forwarding") {
    const src = cleanUciText(options.src, "unknown");
    const dest = cleanUciText(options.dest, "unknown");
    return {
      provider: "openwrt",
      name: `${src} -> ${dest}`,
      kind: label,
      value: "允许区域转发",
      detail: `允许 ${src} 区域转发到 ${dest} 区域`,
      raw: section,
    };
  }
  if (type === "redirect") {
    const dest = [options.dest_ip, options.dest_port].map((x) => cleanUciText(x, "")).filter(Boolean).join(":");
    return {
      provider: "openwrt",
      name: cleanUciText(options.name, "端口转发"),
      kind: label,
      value: `${cleanUciText(options.src_dport, "-")} -> ${dest || cleanUciText(options.dest, "-")}`,
      detail: firewallOptionSummary(options, ["proto", "src", "dest", "target"]),
      raw: section,
    };
  }
  if (type === "rule") {
    return {
      provider: "openwrt",
      name: cleanUciText(options.name, "访问规则"),
      kind: label,
      value: cleanUciText(options.target, "-"),
      detail: firewallOptionSummary(options, ["proto", "src", "dest", "dest_port"]),
      raw: section,
    };
  }
  if (type === "nat") {
    return {
      provider: "openwrt",
      name: cleanUciText(options.name, "NAT 规则"),
      kind: label,
      value: cleanUciText(options.target, "-"),
      detail: firewallOptionSummary(options, ["proto", "src", "dest", "snat_ip", "snat_port"]),
      raw: section,
    };
  }
  return {
    provider: "openwrt",
    name: cleanUciText(options.name, label),
    kind: label,
    value: `${Object.keys(options).length} 项`,
    detail: Object.keys(options).slice(0, 5).join(" / ") || "配置段",
    raw: section,
  };
}

function buildFirewallSummaryRows(data?: OpenWrtFirewall): NetworkFirewallRow[] {
  const rows: NetworkFirewallRow[] = [];
  if (data?.conntrackCount) {
    rows.push({
      provider: "openwrt",
      name: "当前连接数",
      kind: "连接跟踪",
      value: data.conntrackCount,
      detail: "内核 conntrack 当前条目数",
      raw: { conntrackCount: data.conntrackCount },
    });
  }
  const ruleset = data?.raw?.ruleset;
  if (ruleset) {
    rows.push({
      provider: "openwrt",
      name: "规则集规模",
      kind: "nft/iptables",
      value: `${String(ruleset).split(/\r?\n/).filter(Boolean).length} 行`,
      detail: "已读取 nft/iptables 规则输出，原文在原始数据中查看",
      raw: { ruleset },
    });
  }
  return rows;
}

export function mapOpenWrtFirewallGroups(data?: OpenWrtFirewall): NetworkFirewallGroup[] {
  const rows = groupOpenWrtFirewallSections(data?.firewallConfig).map(summarizeOpenWrtFirewallSection);
  return [
    { key: "summary", title: "连接跟踪", rows: buildFirewallSummaryRows(data) },
    { key: "defaults", title: "默认策略", rows: rows.filter((row) => row.kind === "默认策略") },
    { key: "zones", title: "防火墙区域", rows: rows.filter((row) => row.kind.includes("防火墙区域")) },
    { key: "forwardings", title: "区域转发", rows: rows.filter((row) => row.kind === "区域转发") },
    { key: "redirects", title: "端口转发", rows: rows.filter((row) => row.kind === "端口转发") },
    { key: "rules", title: "访问规则", rows: rows.filter((row) => row.kind === "访问规则") },
    { key: "nat", title: "NAT 规则", rows: rows.filter((row) => row.kind === "NAT 规则") },
  ];
}

export function mapIkuaiFirewallGroups(data?: IkuaiStreamResponse): NetworkFirewallGroup[] {
  const count = (data?.devices ?? []).reduce((sum, row) => sum + (Number(row.connections) || 0), 0);
  return [
    {
      key: "summary",
      title: "连接跟踪",
      rows: [
        {
          provider: "ikuai",
          name: "iKuai 终端连接数",
          kind: "终端连接",
          value: count ? String(count) : "-",
          detail: "来自 iKuai 终端流量指标，不混入 OpenWrt 防火墙规则",
          raw: data,
        },
      ],
    },
  ];
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

export function mapMonitoringRows(
  ikuaiDevice?: NetworkDevice,
  ikuaiStream?: IkuaiStreamResponse,
  openWrtDevice?: NetworkDevice,
  openWrtStatus?: OpenWrtStatus
): NetworkMonitoringFamily[] {
  const rows: NetworkMonitoringFamily[] = [];
  if (ikuaiDevice) {
    rows.push({
      provider: "ikuai",
      family: "iKuai Exporter",
      ok: ikuaiStream?.prometheusConfigured !== false,
      detail:
        ikuaiStream?.prometheusConfigured === false
          ? "Prometheus 未配置或未返回 iKuai 指标"
          : `Exporter ${ikuaiStream?.exporterKind || "待确认"}`,
      sampleTime: ikuaiStream?.checkedAt,
      hints: ikuaiStream?.prometheusConfigured === false ? ["检查 iKuai exporter job/instance/scope 标签"] : [],
      raw: ikuaiStream,
    });
  }
  if (openWrtDevice) {
    for (const [key, label] of openWrtFamilyLabels) {
      const ok = Boolean(openWrtStatus?.families?.[key]);
      rows.push({
        provider: "openwrt",
        family: label,
        ok,
        detail: ok ? "采集健康" : "指标族缺失",
        sampleTime: openWrtStatus?.checkedAt,
        hints: ok ? [] : openWrtStatus?.missingHints ?? ["安装或启用对应 OpenWrt collector"],
        raw: { family: key, status: openWrtStatus },
      });
    }
  }
  return rows;
}

export function mapMonitoringCoverage(
  ikuaiDevice?: NetworkDevice,
  ikuaiStream?: IkuaiStreamResponse,
  openWrtDevice?: NetworkDevice,
  openWrtStatus?: OpenWrtStatus
): NetworkMonitoringCoverage[] {
  const coverage: NetworkMonitoringCoverage[] = [];
  if (ikuaiDevice) {
    const rows = mapMonitoringRows(ikuaiDevice, ikuaiStream, undefined, undefined);
    coverage.push({
      provider: "ikuai",
      healthy: rows.every((row) => row.ok !== false),
      sampleTime: ikuaiStream?.checkedAt,
      families: rows,
      missingHints: uniqueNonEmpty(rows.flatMap((row) => row.hints ?? [])),
    });
  }
  if (openWrtDevice) {
    const rows = mapMonitoringRows(undefined, undefined, openWrtDevice, openWrtStatus);
    coverage.push({
      provider: "openwrt",
      healthy: rows.length > 0 && rows.every((row) => row.ok),
      sampleTime: openWrtStatus?.checkedAt,
      families: rows,
      missingHints: uniqueNonEmpty(rows.flatMap((row) => row.hints ?? [])),
    });
  }
  return coverage;
}

export function rowSearchText(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  return Object.values(row as Record<string, unknown>)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
}

export function updatedText(value?: string): string {
  return value ? formatDateTime(value) : "-";
}
