import type { NetworkDeviceKind, SingletonNetworkDevice } from "@/features/network/components/networkDeviceSingleton";

export type ProviderKey = "all" | NetworkDeviceKind;
export type NetworkResourceView = "devices" | "interfaces" | "clients" | "wireless" | "connections" | "monitoring";

export type NetworkDevice = SingletonNetworkDevice & {
  apiUrl?: string;
  host?: string;
  port?: number;
  authType?: string;
  username?: string;
  passwordSet?: boolean;
  privateKeySet?: boolean;
  skipTlsVerify?: boolean;
  notes?: string;
  updatedAt?: string;
};

export type NetworkProviderCapability = {
  provider: NetworkDeviceKind;
  configured: boolean;
  address: string;
  credentials: "saved" | "missing" | "not-required";
  management: Array<{ key: string; label: string; ok: boolean; detail: string }>;
  monitoring: Array<{ key: string; label: string; ok: boolean; detail: string }>;
};

export type NetworkProviderSummary = {
  provider: NetworkDeviceKind;
  label: string;
  configured: boolean;
  address: string;
  updatedAt?: string;
  capability?: NetworkProviderCapability;
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
  group?: string;
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
  category?: "radio" | "ssid" | "station";
  name: string;
  radio: string;
  state: string;
  signal: string;
  detail: string;
  raw?: unknown;
};

export type NetworkFirewallRow = {
  provider: NetworkDeviceKind;
  name: string;
  kind: string;
  value: string;
  detail: string;
  raw?: unknown;
};

export type NetworkFirewallGroup = {
  key: "summary" | "defaults" | "zones" | "forwardings" | "redirects" | "rules" | "nat" | "raw";
  title: string;
  rows: NetworkFirewallRow[];
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

export type NetworkMonitoringCoverage = {
  provider: NetworkDeviceKind;
  healthy: boolean;
  sampleTime?: string;
  families: NetworkMonitoringFamily[];
  missingHints?: string[];
};

export type NetworkResourceEmptyReason =
  | "not-configured"
  | "credentials-missing"
  | "provider-unreachable"
  | "prometheus-missing"
  | "metrics-missing"
  | "unsupported"
  | "empty";

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

export type IkuaiMetricSource = "modern" | "legacy" | "unknown";

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

export type IkuaiStreamResponse = {
  prometheusConfigured?: boolean;
  devices?: IkuaiClientRow[];
  exporterKind?: IkuaiMetricSource;
  note?: string;
  checkedAt?: string;
  queriesUsed?: Record<string, string>;
};

export type IkuaiInterfaceMetricRow = {
  name: string;
  ip: string;
  mac: string;
  comment: string;
  download?: number;
  upload?: number;
};

export type IkuaiInterfacesResult = {
  rows: IkuaiInterfaceMetricRow[];
  source: IkuaiMetricSource;
};

export type OpenWrtOverview = {
  board?: Record<string, unknown>;
  system?: Record<string, unknown>;
  network?: Record<string, unknown>;
  raw?: unknown;
  errors?: string[];
  checkedAt?: string;
};

export type OpenWrtInterfaces = {
  interfaces?: Array<Record<string, unknown>>;
  interfaceDump?: { interface?: Array<Record<string, unknown>> };
  ipAddr?: Array<Record<string, unknown>>;
  ipRoute?: Array<Record<string, unknown>>;
  source?: string;
  checkedAt?: string;
  errors?: string[];
  raw?: unknown;
};

export type OpenWrtClients = {
  leases?: Array<{ host?: string; ip?: string; mac?: string; expires?: string; source?: string }>;
  neighbors?: Array<{ ip?: string; dev?: string; mac?: string; state?: string; source?: string }>;
  raw?: unknown;
  errors?: string[];
};

export type OpenWrtWireless = {
  radios?: Array<Record<string, unknown>>;
  ifaces?: Array<Record<string, unknown> | string>;
  stations?: Array<{ interface?: string; mac?: string; signal?: unknown; rxRate?: unknown; txRate?: unknown }>;
  raw?: unknown;
  errors?: string[];
};

export type OpenWrtFirewallEntry = { key?: string; value?: string; package?: string; section?: string; option?: string };

export type OpenWrtFirewall = {
  firewallConfig?: OpenWrtFirewallEntry[];
  conntrackCount?: string;
  errors?: string[];
  raw?: { ruleset?: string; [key: string]: unknown };
};

export type OpenWrtFamilies = {
  system?: boolean;
  interfaces?: boolean;
  dhcp?: boolean;
  wifi?: boolean;
  netstat?: boolean;
};

export type OpenWrtStatus = {
  prometheusConfigured?: boolean;
  families?: OpenWrtFamilies;
  missingHints?: string[];
  metricNames?: string[];
  note?: string;
  source?: string;
  checkedAt?: string;
};
