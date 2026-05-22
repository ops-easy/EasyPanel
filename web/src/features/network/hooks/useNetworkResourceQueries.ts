import { useQuery } from "@tanstack/react-query";
import { apiGetJson } from "@/lib/api";
import { promInstantVector, promQueryNetwork } from "@/features/vcenter/pages/vcenterPrometheusHelpers";
import type {
  IkuaiInterfacesResult,
  IkuaiInterfaceMetricRow,
  IkuaiMetricSource,
  IkuaiStreamResponse,
  NetworkDevice,
  NetworkResourceView,
  OpenWrtClients,
  OpenWrtFirewall,
  OpenWrtInterfaces,
  OpenWrtOverview,
  OpenWrtStatus,
  OpenWrtWireless,
  ProviderKey,
} from "@/features/network/model/networkTypes";
import { networkText } from "@/features/network/components/NetworkOpsPrimitives";

type UseNetworkResourceQueriesInput = {
  view: NetworkResourceView;
  providerParam: ProviderKey;
  ikuaiDevice?: NetworkDevice;
  openWrtDevice?: NetworkDevice;
};

export function promLabelEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function metricSelector(metric: string, device?: NetworkDevice, extra: string[] = []): string {
  const matchers = [...extra];
  if (device?.instanceLabel) matchers.push(`instance="${promLabelEscape(device.instanceLabel)}"`);
  if (device?.jobLabel) matchers.push(`job="${promLabelEscape(device.jobLabel)}"`);
  return matchers.length > 0 ? `${metric}{${matchers.join(",")}}` : metric;
}

export function streamPath(device?: NetworkDevice): string {
  const scope = encodeURIComponent(device?.prometheusScope || "network");
  return `/api/network/ikuai-client-stream?scope=${scope}&unit=bytes`;
}

export function resolveNetworkResourceLoading(rowsLength: number, devicesLoading: boolean, viewLoading: boolean) {
  const loading = devicesLoading || (rowsLength === 0 && viewLoading);
  const backgroundLoading = !loading && rowsLength > 0 && viewLoading;
  return { loading, backgroundLoading };
}

export function useNetworkResourceQueries({ view, providerParam, ikuaiDevice, openWrtDevice }: UseNetworkResourceQueriesInput) {
  const showIkuai = providerParam === "all" || providerParam === "ikuai";
  const showOpenWrt = providerParam === "all" || providerParam === "openwrt";
  const activeOpenWrtId = openWrtDevice?.id ?? "";

  const ikuaiStreamQ = useQuery({
    queryKey: ["network-resource", "ikuai-stream", ikuaiDevice?.id, ikuaiDevice?.prometheusScope],
    queryFn: ({ signal }) => apiGetJson<IkuaiStreamResponse>(streamPath(ikuaiDevice), { signal }),
    enabled: Boolean(showIkuai && ikuaiDevice && ["devices", "clients", "connections", "monitoring"].includes(view)),
    refetchInterval: showIkuai && ikuaiDevice && view === "clients" ? 20_000 : false,
  });

  const ikuaiInterfacesQ = useQuery({
    queryKey: ["network-resource", "ikuai-interfaces", ikuaiDevice?.id, ikuaiDevice?.prometheusScope],
    queryFn: async ({ signal }) => {
      const info = promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_info", ikuaiDevice), { signal }));
      const modernRx = promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_download_speed_kilobytes", ikuaiDevice), { signal }));
      const modernTx = promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_upload_speed_kilobytes", ikuaiDevice), { signal }));
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
      for (const item of info) {
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
      return { rows: Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name)), source } satisfies IkuaiInterfacesResult;
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

  const hasIkuai = Boolean(showIkuai && ikuaiDevice);
  const hasOpenWrt = Boolean(showOpenWrt && activeOpenWrtId);
  const ikuaiStreamLoading = Boolean(hasIkuai && ikuaiStreamQ.isFetching);
  const ikuaiInterfacesLoading = Boolean(hasIkuai && ikuaiInterfacesQ.isFetching);
  const openWrtExporterLoading = Boolean(hasOpenWrt && openWrtExporterQ.isFetching);
  const openWrtOverviewLoading = Boolean(hasOpenWrt && openWrtOverviewQ.isFetching);
  const openWrtInterfacesLoading = Boolean(hasOpenWrt && openWrtInterfacesQ.isFetching);
  const openWrtClientsLoading = Boolean(hasOpenWrt && openWrtClientsQ.isFetching);
  const openWrtWirelessLoading = Boolean(hasOpenWrt && openWrtWirelessQ.isFetching);
  const openWrtFirewallLoading = Boolean(hasOpenWrt && openWrtFirewallQ.isFetching);

  const viewLoading =
    view === "devices"
      ? ikuaiStreamLoading || openWrtExporterLoading || openWrtOverviewLoading
      : view === "interfaces"
        ? ikuaiInterfacesLoading || openWrtInterfacesLoading
        : view === "clients"
          ? ikuaiStreamLoading || openWrtClientsLoading
          : view === "wireless"
            ? openWrtWirelessLoading
            : view === "connections"
              ? ikuaiStreamLoading || openWrtFirewallLoading
              : ikuaiStreamLoading || openWrtExporterLoading;

  const refetchAll = () => {
    void ikuaiStreamQ.refetch();
    void ikuaiInterfacesQ.refetch();
    void openWrtExporterQ.refetch();
    void openWrtOverviewQ.refetch();
    void openWrtInterfacesQ.refetch();
    void openWrtClientsQ.refetch();
    void openWrtWirelessQ.refetch();
    void openWrtFirewallQ.refetch();
  };

  const errors = [
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

  return {
    showIkuai,
    showOpenWrt,
    activeOpenWrtId,
    ikuaiStreamQ,
    ikuaiInterfacesQ,
    openWrtExporterQ,
    openWrtOverviewQ,
    openWrtInterfacesQ,
    openWrtClientsQ,
    openWrtWirelessQ,
    openWrtFirewallQ,
    viewLoading,
    errors,
    refetchAll,
  };
}
