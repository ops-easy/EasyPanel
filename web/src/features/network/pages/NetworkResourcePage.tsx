import { useMemo, useState, type ComponentType } from "react";
import { useSearchParams } from "react-router-dom";
import { Cable, Gauge, Network, Shield, Users, Wifi } from "lucide-react";
import { NetworkResourceShell } from "@/features/network/components/NetworkResourceShell";
import { resolveNetworkResourceLoading, useNetworkResourceQueries } from "@/features/network/hooks/useNetworkResourceQueries";
import { useNetworkDevices } from "@/features/network/hooks/useNetworkDevices";
import {
  mapDeviceRows,
  mapIkuaiClients,
  mapIkuaiFirewallGroups,
  mapIkuaiInterfaces,
  mapMonitoringCoverage,
  mapMonitoringRows,
  mapOpenWrtClients,
  mapOpenWrtFirewallGroups,
  mapOpenWrtInterfaces,
  mapOpenWrtWireless,
  mapProviderSummaries,
  rowSearchText,
} from "@/features/network/model/networkMappers";
import type {
  NetworkClientRow,
  NetworkDeviceRow,
  NetworkFirewallGroup,
  NetworkInterfaceRow,
  NetworkMonitoringFamily,
  NetworkResourceView,
  NetworkWirelessRow,
  ProviderKey,
} from "@/features/network/model/networkTypes";
import { NetworkClientsView } from "@/features/network/views/NetworkClientsView";
import { NetworkDevicesView } from "@/features/network/views/NetworkDevicesView";
import { NetworkFirewallView } from "@/features/network/views/NetworkFirewallView";
import { NetworkInterfacesView } from "@/features/network/views/NetworkInterfacesView";
import { NetworkMonitoringView } from "@/features/network/views/NetworkMonitoringView";
import { NetworkWirelessView } from "@/features/network/views/NetworkWirelessView";

const viewMeta: Record<
  NetworkResourceView,
  {
    title: string;
    description: string;
    icon: ComponentType<{ className?: string }>;
    empty: string;
  }
> = {
  devices: {
    title: "设备",
    description: "查看 iKuai 与 OpenWrt 接入状态、管理地址、监控覆盖和最近更新时间。",
    icon: Network,
    empty: "当前没有可展示的网络设备。",
  },
  interfaces: {
    title: "接口",
    description: "聚合 iKuai 与 OpenWrt 接口、地址、状态和吞吐；来源只作为筛选条件。",
    icon: Cable,
    empty: "当前来源还没有接口数据。OpenWrt 需要 SSH/ubus 可用，iKuai 需要 Prometheus 指标。",
  },
  clients: {
    title: "终端",
    description: "汇总 DHCP 租约、邻居表和 iKuai 终端流量，统一查看 IP、MAC、备注与连接数。",
    icon: Users,
    empty: "当前来源还没有终端数据。",
  },
  wireless: {
    title: "无线",
    description: "查看 OpenWrt Radio、SSID、关联终端和信号状态；iKuai 暂作为来源筛选，不混入无线表。",
    icon: Wifi,
    empty: "当前来源还没有无线数据。",
  },
  connections: {
    title: "防火墙",
    description: "展示默认策略、防火墙区域、端口转发、NAT、访问规则和连接跟踪，让连接问题可读可排查。",
    icon: Shield,
    empty: "当前来源还没有防火墙或连接跟踪数据。",
  },
  monitoring: {
    title: "监控",
    description: "统一检查采集源健康、最近样本时间、指标族覆盖和 collector 缺失提示。",
    icon: Gauge,
    empty: "当前来源还没有监控采集数据。",
  },
};

function normalizeProvider(value: string | null): ProviderKey {
  return value === "ikuai" || value === "openwrt" ? value : "all";
}

function filterRows<T extends { provider: "ikuai" | "openwrt" }>(rows: T[], provider: ProviderKey, query: string): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (provider !== "all" && row.provider !== provider) return false;
    if (!q) return true;
    return rowSearchText(row).includes(q);
  });
}

function filterFirewallGroups(groups: NetworkFirewallGroup[], provider: ProviderKey, query: string): NetworkFirewallGroup[] {
  return groups
    .map((group) => ({
      ...group,
      rows: filterRows(group.rows, provider, query),
    }))
    .filter((group) => group.rows.length > 0);
}

function rowCountForGroups(groups: NetworkFirewallGroup[]): number {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}

export default function NetworkResourcePage({ view }: { view: NetworkResourceView }) {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const providerParam = normalizeProvider(params.get("provider"));
  const meta = viewMeta[view];
  const Icon = meta.icon;

  const devicesState = useNetworkDevices();
  const { query: devicesQ, devices, ikuaiDevice, openWrtDevice, canWrite, canViewRaw } = devicesState;
  const resourceQ = useNetworkResourceQueries({ view, providerParam, ikuaiDevice, openWrtDevice });

  const providers = useMemo(() => mapProviderSummaries(ikuaiDevice, openWrtDevice), [ikuaiDevice, openWrtDevice]);

  const deviceRows = useMemo<NetworkDeviceRow[]>(
    () =>
      mapDeviceRows({
        ikuaiDevice,
        ikuaiStream: resourceQ.ikuaiStreamQ.data,
        openWrtDevice,
        openWrtOverview: resourceQ.openWrtOverviewQ.data,
        openWrtStatus: resourceQ.openWrtExporterQ.data,
        showIkuai: resourceQ.showIkuai,
        showOpenWrt: resourceQ.showOpenWrt,
      }),
    [
      ikuaiDevice,
      openWrtDevice,
      resourceQ.ikuaiStreamQ.data,
      resourceQ.openWrtExporterQ.data,
      resourceQ.openWrtOverviewQ.data,
      resourceQ.showIkuai,
      resourceQ.showOpenWrt,
    ]
  );

  const interfaceRows = useMemo<NetworkInterfaceRow[]>(
    () => [
      ...(resourceQ.showIkuai ? mapIkuaiInterfaces(resourceQ.ikuaiInterfacesQ.data) : []),
      ...(resourceQ.showOpenWrt ? mapOpenWrtInterfaces(resourceQ.openWrtInterfacesQ.data) : []),
    ],
    [resourceQ.ikuaiInterfacesQ.data, resourceQ.openWrtInterfacesQ.data, resourceQ.showIkuai, resourceQ.showOpenWrt]
  );

  const clientRows = useMemo<NetworkClientRow[]>(
    () => [
      ...(resourceQ.showIkuai ? mapIkuaiClients(resourceQ.ikuaiStreamQ.data) : []),
      ...(resourceQ.showOpenWrt ? mapOpenWrtClients(resourceQ.openWrtClientsQ.data) : []),
    ],
    [resourceQ.ikuaiStreamQ.data, resourceQ.openWrtClientsQ.data, resourceQ.showIkuai, resourceQ.showOpenWrt]
  );

  const wirelessRows = useMemo<NetworkWirelessRow[]>(
    () => (resourceQ.showOpenWrt ? mapOpenWrtWireless(resourceQ.openWrtWirelessQ.data) : []),
    [resourceQ.openWrtWirelessQ.data, resourceQ.showOpenWrt]
  );

  const firewallGroups = useMemo<NetworkFirewallGroup[]>(
    () => [
      ...(resourceQ.showIkuai ? mapIkuaiFirewallGroups(resourceQ.ikuaiStreamQ.data) : []),
      ...(resourceQ.showOpenWrt ? mapOpenWrtFirewallGroups(resourceQ.openWrtFirewallQ.data) : []),
    ],
    [resourceQ.ikuaiStreamQ.data, resourceQ.openWrtFirewallQ.data, resourceQ.showIkuai, resourceQ.showOpenWrt]
  );

  const monitoringRows = useMemo<NetworkMonitoringFamily[]>(
    () =>
      mapMonitoringRows(
        resourceQ.showIkuai ? ikuaiDevice : undefined,
        resourceQ.showIkuai ? resourceQ.ikuaiStreamQ.data : undefined,
        resourceQ.showOpenWrt ? openWrtDevice : undefined,
        resourceQ.showOpenWrt ? resourceQ.openWrtExporterQ.data : undefined
      ),
    [
      ikuaiDevice,
      openWrtDevice,
      resourceQ.ikuaiStreamQ.data,
      resourceQ.openWrtExporterQ.data,
      resourceQ.showIkuai,
      resourceQ.showOpenWrt,
    ]
  );

  const monitoringCoverage = useMemo(
    () =>
      mapMonitoringCoverage(
        resourceQ.showIkuai ? ikuaiDevice : undefined,
        resourceQ.showIkuai ? resourceQ.ikuaiStreamQ.data : undefined,
        resourceQ.showOpenWrt ? openWrtDevice : undefined,
        resourceQ.showOpenWrt ? resourceQ.openWrtExporterQ.data : undefined
      ),
    [
      ikuaiDevice,
      openWrtDevice,
      resourceQ.ikuaiStreamQ.data,
      resourceQ.openWrtExporterQ.data,
      resourceQ.showIkuai,
      resourceQ.showOpenWrt,
    ]
  );

  const filteredDeviceRows = useMemo(() => filterRows(deviceRows, providerParam, query), [deviceRows, providerParam, query]);
  const filteredInterfaceRows = useMemo(() => filterRows(interfaceRows, providerParam, query), [interfaceRows, providerParam, query]);
  const filteredClientRows = useMemo(() => filterRows(clientRows, providerParam, query), [clientRows, providerParam, query]);
  const filteredWirelessRows = useMemo(() => filterRows(wirelessRows, providerParam, query), [wirelessRows, providerParam, query]);
  const filteredFirewallGroups = useMemo(() => filterFirewallGroups(firewallGroups, providerParam, query), [firewallGroups, providerParam, query]);
  const filteredMonitoringRows = useMemo(() => filterRows(monitoringRows, providerParam, query), [monitoringRows, providerParam, query]);

  const currentRowCount =
    view === "devices"
      ? deviceRows.length
      : view === "interfaces"
        ? interfaceRows.length
        : view === "clients"
          ? clientRows.length
          : view === "wireless"
            ? wirelessRows.length
            : view === "connections"
              ? rowCountForGroups(firewallGroups)
              : monitoringRows.length;

  const filteredRowCount =
    view === "devices"
      ? filteredDeviceRows.length
      : view === "interfaces"
        ? filteredInterfaceRows.length
        : view === "clients"
          ? filteredClientRows.length
          : view === "wireless"
            ? filteredWirelessRows.length
            : view === "connections"
              ? rowCountForGroups(filteredFirewallGroups)
              : filteredMonitoringRows.length;

  const providerCount = (provider: "ikuai" | "openwrt") => {
    if (view === "connections") return rowCountForGroups(firewallGroups.map((group) => ({ ...group, rows: group.rows.filter((row) => row.provider === provider) })));
    const rows =
      view === "devices"
        ? deviceRows
        : view === "interfaces"
          ? interfaceRows
          : view === "clients"
            ? clientRows
            : view === "wireless"
              ? wirelessRows
              : monitoringRows;
    return rows.filter((row) => row.provider === provider).length;
  };

  const { loading, backgroundLoading } = resolveNetworkResourceLoading(currentRowCount, devicesQ.isLoading, resourceQ.viewLoading);
  const emptyLabel = query || providerParam !== "all" ? "没有匹配当前筛选条件的资源。" : meta.empty;
  const errors = [
    devicesQ.error ? (devicesQ.error instanceof Error ? devicesQ.error.message : String(devicesQ.error)) : "",
    ...resourceQ.errors,
  ].filter(Boolean);

  const setProvider = (provider: ProviderKey) => {
    const next = new URLSearchParams(params);
    if (provider === "all") next.delete("provider");
    else next.set("provider", provider);
    setParams(next, { replace: true });
  };

  const refresh = () => {
    void devicesQ.refetch();
    resourceQ.refetchAll();
  };

  return (
    <NetworkResourceShell
      title={meta.title}
      description={meta.description}
      icon={<Icon className="h-6 w-6" />}
      summary={[
        { label: "总数", value: filteredRowCount },
        { label: "iKuai", value: providerCount("ikuai") },
        { label: "OpenWrt", value: providerCount("openwrt") },
      ]}
      providers={providers}
      devices={devices}
      provider={providerParam}
      onProviderChange={setProvider}
      query={query}
      onQueryChange={setQuery}
      loading={loading}
      backgroundLoading={backgroundLoading}
      errors={errors}
      onRefresh={refresh}
      rawVisible={canViewRaw}
      rawValue={{
        providerParam,
        devices: devicesQ.data,
        ikuaiStream: resourceQ.ikuaiStreamQ.data,
        ikuaiInterfaces: resourceQ.ikuaiInterfacesQ.data,
        openwrtExporter: resourceQ.openWrtExporterQ.data,
        openwrtOverview: resourceQ.openWrtOverviewQ.data,
        openwrtInterfaces: resourceQ.openWrtInterfacesQ.data,
        openwrtClients: resourceQ.openWrtClientsQ.data,
        openwrtWireless: resourceQ.openWrtWirelessQ.data,
        openwrtFirewall: resourceQ.openWrtFirewallQ.data,
      }}
    >
      {view === "devices" ? (
        <NetworkDevicesView
          rows={filteredDeviceRows}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      ) : view === "interfaces" ? (
        <NetworkInterfacesView
          rows={filteredInterfaceRows}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      ) : view === "clients" ? (
        <NetworkClientsView
          rows={filteredClientRows}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      ) : view === "wireless" ? (
        <NetworkWirelessView
          rows={filteredWirelessRows}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      ) : view === "connections" ? (
        <NetworkFirewallView
          groups={filteredFirewallGroups}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      ) : (
        <NetworkMonitoringView
          rows={filteredMonitoringRows}
          coverage={monitoringCoverage}
          loading={loading}
          emptyLabel={emptyLabel}
          devices={devices}
          provider={providerParam}
          canWrite={canWrite}
          canViewRaw={canViewRaw}
        />
      )}
    </NetworkResourceShell>
  );
}
