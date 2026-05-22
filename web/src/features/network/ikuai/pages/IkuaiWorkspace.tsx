import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Cable, Database, Loader2, Network, Router, Users } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson } from "@/lib/api";
import { Badge } from "@/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import {
  EmptyTableRow,
  formatRate,
  LoadingTableRow,
  NetworkMetricCard,
  networkText,
  RawDataDisclosure,
} from "@/features/network/components/NetworkOpsPrimitives";
import {
  deviceQueryHint,
  singleNetworkDeviceByKind,
  type SingletonNetworkDevice,
} from "@/features/network/components/networkDeviceSingleton";
import { promInstantVector, promQueryNetwork } from "@/features/vcenter/pages/vcenterPrometheusHelpers";

export type IkuaiView = "dashboard" | "interfaces" | "clients" | "vm-mapping";

type NetworkDevice = SingletonNetworkDevice & {
  notes?: string;
  updatedAt?: string;
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
  queriesUsed?: Record<string, string>;
};

type IkuaiInterfaceRow = {
  name: string;
  ip: string;
  mac: string;
  comment: string;
  download?: number;
  upload?: number;
};

const viewMeta: Record<IkuaiView, { title: string; desc: string; icon: typeof Router }> = {
  dashboard: {
    title: "iKuai 总览",
    desc: "汇总实例配置、Exporter 类型、接口吞吐和终端流量，作为 iKuai 运维入口。",
    icon: Router,
  },
  interfaces: {
    title: "iKuai 接口",
    desc: "从 iKuai exporter 汇总接口信息、上下行速率和 WAN/LAN 备注。",
    icon: Cable,
  },
  clients: {
    title: "iKuai 客户端",
    desc: "按终端 IP 展示实时上下行、连接数、主机名和备注。",
    icon: Users,
  },
  "vm-mapping": {
    title: "iKuai 终端映射",
    desc: "用 IP、MAC、主机名和备注建立网络终端视图，替代旧的空映射占位。",
    icon: Network,
  },
};

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

function clientDisplayName(row: IkuaiClientRow): string {
  return row.comment || row.hostname || row.ip || "未命名终端";
}

function useIkuaiDevice() {
  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    staleTime: 60_000,
  });
  const device = useMemo(
    () => singleNetworkDeviceByKind(devicesQ.data?.devices ?? [], "ikuai"),
    [devicesQ.data?.devices]
  );
  return { devicesQ, device };
}

function useIkuaiStream(device?: NetworkDevice, enabled = true) {
  return useQuery({
    queryKey: ["ikuai-network-client-stream", device?.id, device?.prometheusScope],
    queryFn: ({ signal }) => apiGetJson<IkuaiStreamResponse>(streamPath(device), { signal }),
    enabled: Boolean(enabled && device),
    refetchInterval: enabled && device ? 20_000 : false,
  });
}

function useIkuaiInterfaces(device?: NetworkDevice, enabled = true) {
  return useQuery({
    queryKey: ["ikuai-network-interfaces", device?.id, device?.instanceLabel, device?.jobLabel],
    queryFn: async ({ signal }) => {
      const infoData = await promQueryNetwork(metricSelector("ikuai_iface_info", device), { signal });
      const infoRows = promInstantVector(infoData);
      const modernRx = promInstantVector(await promQueryNetwork(metricSelector("ikuai_network_recv_kbytes_per_second", device, ['id=~"iface/.*"']), { signal }));
      const modernTx = promInstantVector(await promQueryNetwork(metricSelector("ikuai_network_send_kbytes_per_second", device, ['id=~"iface/.*"']), { signal }));
      const source: IkuaiMetricSource = modernRx.length > 0 || modernTx.length > 0 ? "modern" : "legacy";
      const rxRows = source === "modern" ? modernRx : promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_stream_download", device), { signal }));
      const txRows = source === "modern" ? modernTx : promInstantVector(await promQueryNetwork(metricSelector("ikuai_iface_stream_upload", device), { signal }));
      const rows = new Map<string, IkuaiInterfaceRow>();
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
    enabled: Boolean(enabled && device),
    refetchInterval: enabled && device ? 20_000 : false,
  });
}

export default function IkuaiWorkspace({ view }: { view: IkuaiView }) {
  return <IkuaiManagedWorkspace view={view} />;
}

function IkuaiManagedWorkspace({ view }: { view: IkuaiView }) {
  const { status } = useAuth();
  const canViewRaw = status?.role === "admin";
  const { devicesQ, device } = useIkuaiDevice();
  const streamQ = useIkuaiStream(device, view === "dashboard" || view === "clients" || view === "vm-mapping");
  const interfacesQ = useIkuaiInterfaces(device, view === "dashboard" || view === "interfaces");
  const meta = viewMeta[view];
  const Icon = meta.icon;

  const clients = streamQ.data?.devices ?? [];
  const topClient = clients[0];
  const source = streamQ.data?.exporterKind ?? interfacesQ.data?.source ?? "unknown";

  if (devicesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载 iKuai 设备配置...
      </div>
    );
  }

  if (!device) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <Router className="mx-auto h-8 w-8 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-950">请先配置 iKuai 实例</h2>
        <p className="mt-2 text-sm text-slate-500">在网络设备总览页保存 iKuai 的 Prometheus scope、instance 或 job 标签后再查看该页面。</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Icon className="mt-1 h-5 w-5 text-cyan-700" />
          <div>
            <p className="text-xs font-semibold uppercase text-cyan-700">iKuai</p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{meta.title}</h1>
            <p className="mt-1 text-sm text-slate-600">{meta.desc}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <NetworkMetricCard label="当前实例" value={device.name} hint={deviceQueryHint(device)} tone="cyan" />
          <NetworkMetricCard label="Exporter" value={source === "unknown" ? "待探测" : source === "modern" ? "Go 版" : "Python 版"} hint="iKuai metrics" tone="emerald" />
          <NetworkMetricCard label="终端数量" value={clients.length} hint="实时流量表" />
          <NetworkMetricCard label="最高下行" value={formatRate(topClient?.download, rateUnit(streamQ.data?.exporterKind))} hint={topClient ? clientDisplayName(topClient) : "-"} />
        </div>
      </section>

      {view === "dashboard" ? (
        <IkuaiDashboardPanel
          interfaces={interfacesQ.data?.rows ?? []}
          clients={clients}
          source={source}
          streamData={streamQ.data}
          loading={streamQ.isLoading || interfacesQ.isLoading}
          streamError={streamQ.error}
          interfacesError={interfacesQ.error}
          canViewRaw={canViewRaw}
        />
      ) : null}

      {view === "interfaces" ? (
        <IkuaiInterfacesPanel
          rows={interfacesQ.data?.rows ?? []}
          source={interfacesQ.data?.source}
          loading={interfacesQ.isLoading}
          error={interfacesQ.error}
          canViewRaw={canViewRaw}
        />
      ) : null}

      {view === "clients" ? (
        <IkuaiClientsPanel data={streamQ.data} loading={streamQ.isLoading} error={streamQ.error} canViewRaw={canViewRaw} />
      ) : null}

      {view === "vm-mapping" ? (
        <IkuaiMappingPanel data={streamQ.data} loading={streamQ.isLoading} error={streamQ.error} canViewRaw={canViewRaw} />
      ) : null}
    </div>
  );
}

function IkuaiDashboardPanel({
  interfaces,
  clients,
  source,
  streamData,
  loading,
  streamError,
  interfacesError,
  canViewRaw,
}: {
  interfaces: IkuaiInterfaceRow[];
  clients: IkuaiClientRow[];
  source: IkuaiMetricSource;
  streamData?: IkuaiStreamResponse;
  loading: boolean;
  streamError: Error | null;
  interfacesError: Error | null;
  canViewRaw: boolean;
}) {
  const topClients = clients.slice(0, 8);
  const topInterfaces = interfaces.slice(0, 6);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Panel title="接口吞吐摘要" icon={<Activity className="h-4 w-4 text-cyan-700" />}>
        {interfacesError ? <ErrorBox message={interfacesError.message} /> : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>接口</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>备注</TableHead>
                <TableHead className="text-right">上行</TableHead>
                <TableHead className="text-right">下行</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <LoadingTableRow colSpan={5} /> : null}
              {!loading && topInterfaces.length === 0 ? <EmptyTableRow colSpan={5} label="暂无接口指标" /> : null}
              {!loading
                ? topInterfaces.map((row) => (
                    <TableRow key={row.name}>
                      <TableCell className="font-mono text-xs">{row.name}</TableCell>
                      <TableCell className="font-mono text-xs">{row.ip}</TableCell>
                      <TableCell>{row.comment}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatRate(row.upload, rateUnit(source))}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatRate(row.download, rateUnit(source))}</TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-slate-500">接口数据来自 Prometheus iKuai 指标，详情可进入“iKuai 接口”。</p>
      </Panel>

      <Panel title="终端流量 Top" icon={<Users className="h-4 w-4 text-cyan-700" />}>
        {streamError ? <ErrorBox message={streamError.message} /> : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>终端</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">上行</TableHead>
                <TableHead className="text-right">下行</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <LoadingTableRow colSpan={4} /> : null}
              {!loading && topClients.length === 0 ? <EmptyTableRow colSpan={4} label="暂无终端流量" /> : null}
              {!loading
                ? topClients.map((row, idx) => (
                    <TableRow key={`${row.ip}-${row.mac}-${idx}`}>
                      <TableCell className="max-w-44 truncate font-medium text-slate-900">{clientDisplayName(row)}</TableCell>
                      <TableCell className="font-mono text-xs">{networkText(row.ip)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatRate(row.upload, rateUnit(streamData?.exporterKind))}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatRate(row.download, rateUnit(streamData?.exporterKind))}</TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-slate-500">{streamData?.note || "终端数据来自网络模块 iKuai stream 接口。"}</p>
      </Panel>

      <div className="xl:col-span-2">
        <RawDataDisclosure value={{ stream: streamData, interfaces }} visible={canViewRaw} />
      </div>
    </div>
  );
}

function IkuaiInterfacesPanel({
  rows,
  source,
  loading,
  error,
  canViewRaw,
}: {
  rows: IkuaiInterfaceRow[];
  source?: IkuaiMetricSource;
  loading: boolean;
  error: Error | null;
  canViewRaw: boolean;
}) {
  return (
    <Panel title="接口运行状态" icon={<Cable className="h-4 w-4 text-cyan-700" />}>
      {error ? <ErrorBox message={error.message} /> : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>接口</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead>备注</TableHead>
              <TableHead className="text-right">上行</TableHead>
              <TableHead className="text-right">下行</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingTableRow colSpan={6} /> : null}
            {!loading && rows.length === 0 ? <EmptyTableRow colSpan={6} label="未发现 iKuai 接口指标" /> : null}
            {!loading
              ? rows.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-mono text-xs">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.ip}</TableCell>
                    <TableCell className="font-mono text-xs">{row.mac}</TableCell>
                    <TableCell>{row.comment}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatRate(row.upload, rateUnit(source))}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatRate(row.download, rateUnit(source))}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-slate-500">数据源：{source === "modern" ? "Go 版 ikuai_exporter" : "Python 版或兼容指标"}</p>
      <RawDataDisclosure value={{ rows, source }} visible={canViewRaw} />
    </Panel>
  );
}

function IkuaiClientsPanel({
  data,
  loading,
  error,
  canViewRaw,
}: {
  data?: IkuaiStreamResponse;
  loading: boolean;
  error: Error | null;
  canViewRaw: boolean;
}) {
  const rows = data?.devices ?? [];
  return (
    <Panel title="终端实时流量" icon={<Users className="h-4 w-4 text-cyan-700" />}>
      {error ? <ErrorBox message={error.message} /> : null}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP</TableHead>
              <TableHead>主机/备注</TableHead>
              <TableHead>MAC</TableHead>
              <TableHead>连接</TableHead>
              <TableHead className="text-right">上行</TableHead>
              <TableHead className="text-right">下行</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <LoadingTableRow colSpan={6} /> : null}
            {!loading && rows.length === 0 ? <EmptyTableRow colSpan={6} label="未发现 iKuai 客户端流量" /> : null}
            {!loading
              ? rows.map((row, idx) => (
                  <TableRow key={`${row.ip}-${row.mac}-${idx}`}>
                    <TableCell className="font-mono text-xs">{networkText(row.ip)}</TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{clientDisplayName(row)}</p>
                      <p className="text-xs text-slate-500">{networkText(row.clientType)}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{networkText(row.mac)}</TableCell>
                    <TableCell className="tabular-nums">{networkText(row.connections)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatRate(row.upload, rateUnit(data?.exporterKind))}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{formatRate(row.download, rateUnit(data?.exporterKind))}</TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-slate-500">{data?.note || "来自网络模块 iKuai stream 接口。"}</p>
      <RawDataDisclosure value={data} visible={canViewRaw} />
    </Panel>
  );
}

function IkuaiMappingPanel({
  data,
  loading,
  error,
  canViewRaw,
}: {
  data?: IkuaiStreamResponse;
  loading: boolean;
  error: Error | null;
  canViewRaw: boolean;
}) {
  const rows = data?.devices ?? [];
  return (
    <Panel title="终端映射视图" icon={<Database className="h-4 w-4 text-cyan-700" />}>
      {error ? <ErrorBox message={error.message} /> : null}
      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在读取终端映射...
        </div>
      ) : null}
      {!loading && rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          未发现可映射的 iKuai 终端。
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!loading
          ? rows.slice(0, 60).map((row, idx) => (
              <div key={`${row.ip}-${row.mac}-${idx}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{clientDisplayName(row)}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">{networkText(row.ip)}</p>
                  </div>
                  <Badge variant="outline">{row.mac ? "已识别" : "待补全"}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs">
                  <Fact label="MAC" value={networkText(row.mac)} />
                  <Fact label="上行" value={formatRate(row.upload, rateUnit(data?.exporterKind))} />
                  <Fact label="下行" value={formatRate(row.download, rateUnit(data?.exporterKind))} />
                </div>
              </div>
            ))
          : null}
      </div>
      <div className="mt-4">
        <RawDataDisclosure value={data} visible={canViewRaw} />
      </div>
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

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_1fr] gap-2 rounded-md bg-slate-50 px-2 py-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-800" title={String(value ?? "")}>{value}</span>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {message}
    </div>
  );
}
