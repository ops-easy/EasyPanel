import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Cable, Gauge, Network, Router, Settings, Users, Wifi } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  deviceQueryHint,
  singleNetworkDeviceByKind,
  type NetworkDeviceKind,
  type SingletonNetworkDevice,
} from "@/features/network/components/networkDeviceSingleton";
import { formatDateTime, NetworkMetricCard } from "@/features/network/components/NetworkOpsPrimitives";

type NetworkDevice = SingletonNetworkDevice & {
  apiUrl?: string;
  host?: string;
  port?: number;
  passwordSet?: boolean;
  privateKeySet?: boolean;
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

const providerLabels: Record<NetworkDeviceKind, string> = {
  ikuai: "iKuai",
  openwrt: "OpenWrt",
};

const familyKeys: Array<keyof OpenWrtFamilies> = ["system", "interfaces", "dhcp", "wifi", "netstat"];

const resourceCards = [
  {
    key: "devices",
    label: "设备",
    desc: "查看 iKuai、OpenWrt 的接入状态、管理地址、监控覆盖和最近更新时间。",
    to: "/cluster/network/devices",
    icon: Network,
    tint: "border-cyan-200 bg-cyan-50 text-cyan-800",
  },
  {
    key: "interfaces",
    label: "接口",
    desc: "聚合物理口、逻辑口、地址、备注与上下行速率，按来源筛选排查链路。",
    to: "/cluster/network/interfaces",
    icon: Cable,
    tint: "border-sky-200 bg-sky-50 text-sky-800",
  },
  {
    key: "clients",
    label: "终端",
    desc: "把 DHCP、邻居表与 iKuai 终端流量放到一张表里，快速定位 IP、MAC 和备注。",
    to: "/cluster/network/clients",
    icon: Users,
    tint: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  {
    key: "wireless",
    label: "无线",
    desc: "集中查看 OpenWrt radio、SSID、关联终端、信号和速率状态。",
    to: "/cluster/network/wireless",
    icon: Wifi,
    tint: "border-indigo-200 bg-indigo-50 text-indigo-800",
  },
  {
    key: "connections",
    label: "防火墙",
    desc: "查看 OpenWrt 防火墙区域、端口转发、NAT 和连接跟踪，iKuai 显示终端连接数。",
    to: "/cluster/network/connections",
    icon: Activity,
    tint: "border-amber-200 bg-amber-50 text-amber-900",
  },
  {
    key: "monitoring",
    label: "监控",
    desc: "检查 Prometheus 指标族、Exporter 覆盖和缺失提示，原始响应只进排障区。",
    to: "/cluster/network/monitoring",
    icon: Gauge,
    tint: "border-violet-200 bg-violet-50 text-violet-800",
  },
] as const;

function updatedLabel(device?: NetworkDevice): string {
  if (!device?.updatedAt) return "尚未保存";
  return formatDateTime(device.updatedAt);
}

function providerReady(kind: NetworkDeviceKind, device?: NetworkDevice): boolean {
  if (!device) return false;
  if (kind === "ikuai") return Boolean(device.instanceLabel || device.jobLabel || device.prometheusScope);
  return Boolean(device.host || device.apiUrl || device.passwordSet || device.privateKeySet);
}

function ProviderAccessBadge({ kind, device }: { kind: NetworkDeviceKind; device?: NetworkDevice }) {
  const ready = providerReady(kind, device);
  const hint =
    kind === "openwrt"
      ? device?.host || device?.apiUrl || "需要 SSH/API 接入"
      : deviceQueryHint(device) || "需要 Prometheus 标签";
  const Icon = kind === "ikuai" ? Router : Wifi;
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
            kind === "ikuai" ? "border-sky-100 bg-sky-50 text-sky-700" : "border-cyan-100 bg-cyan-50 text-cyan-700"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{providerLabels[kind]}</p>
          <p className="truncate text-xs text-slate-500" title={hint}>
            {hint}
          </p>
        </div>
      </div>
      <Badge
        variant="outline"
        className={cn(
          "shrink-0 font-normal",
          ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-100 text-slate-600"
        )}
      >
        {ready ? "已接入" : "未接入"}
      </Badge>
    </div>
  );
}

function NetworkResourceCard({
  label,
  desc,
  to,
  icon: Icon,
  tint,
  count,
}: (typeof resourceCards)[number] & { count: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="group min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className={cn("mb-4 flex h-11 w-11 items-center justify-center rounded-lg border", tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="truncate text-base font-semibold text-slate-950">{label}</h2>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
          {count}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
    </Link>
  );
}

const NetworkDashboard: React.FC = () => {
  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const devices = useMemo(() => devicesQ.data?.devices ?? [], [devicesQ.data?.devices]);
  const ikuaiDevice = useMemo(() => singleNetworkDeviceByKind(devices, "ikuai"), [devices]);
  const openWrtDevice = useMemo(() => singleNetworkDeviceByKind(devices, "openwrt"), [devices]);
  const configuredCount = Number(Boolean(ikuaiDevice)) + Number(Boolean(openWrtDevice));
  const providerConfigured = configuredCount > 0;

  const openWrtStatusQ = useQuery({
    queryKey: ["network-device-exporter-status", openWrtDevice?.id],
    queryFn: ({ signal }) =>
      apiGetJson<OpenWrtStatus>(`/api/network/devices/${encodeURIComponent(openWrtDevice?.id ?? "")}/exporter-status`, {
        signal,
      }),
    enabled: Boolean(openWrtDevice?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const openWrtReadyCount = familyKeys.filter((key) => Boolean(openWrtStatusQ.data?.families?.[key])).length;
  const latestUpdate = [ikuaiDevice?.updatedAt, openWrtDevice?.updatedAt]
    .filter(Boolean)
    .sort()
    .at(-1);

  const cardCounts: Record<(typeof resourceCards)[number]["key"], React.ReactNode> = {
    devices: `${configuredCount}/2`,
    interfaces: providerConfigured ? "按来源" : "-",
    clients: providerConfigured ? "汇总" : "-",
    wireless: openWrtDevice ? "OpenWrt" : "-",
    connections: providerConfigured ? "可排查" : "-",
    monitoring: openWrtDevice ? `${openWrtReadyCount}/5` : ikuaiDevice ? "iKuai" : "-",
  };

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-6 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network Center</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Network className="h-6 w-6 text-cyan-700" />
              网络资源中心
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              日常入口按资源对象组织：设备、接口、终端、无线、防火墙和监控统一检索；iKuai 与 OpenWrt 只作为数据来源筛选，接入信息集中放在接入设置页。
            </p>
          </div>
          <Button asChild className="w-fit gap-2 bg-cyan-700 hover:bg-cyan-800">
            <Link to={providerConfigured ? "/cluster/network/devices" : "/cluster/network/config"}>
              {providerConfigured ? "查看设备" : "打开接入设置"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-950">接入源健康</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/cluster/network/config">接入设置</Link>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {devicesQ.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500 shadow-sm">
              正在读取网络接入源...
            </div>
          ) : (
            <>
              <ProviderAccessBadge kind="ikuai" device={ikuaiDevice} />
              <ProviderAccessBadge kind="openwrt" device={openWrtDevice} />
            </>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NetworkMetricCard label="接入源" value={`${configuredCount}/2`} hint="iKuai / OpenWrt" tone="cyan" />
        <NetworkMetricCard label="OpenWrt 指标" value={`${openWrtReadyCount}/5`} hint="Prometheus 指标族" tone="emerald" />
        <NetworkMetricCard
          label="最近更新"
          value={latestUpdate ? formatDateTime(latestUpdate) : "尚未保存"}
          hint="接入记录"
          tone="slate"
        />
        <NetworkMetricCard label="接入入口" value={providerConfigured ? "已就绪" : "待接入"} hint="统一接入设置" tone="amber" />
      </section>

      {providerConfigured ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-950">资源入口</h2>
            <Button asChild variant="outline" size="sm" className="gap-2">
              <Link to="/cluster/network/devices">
                路由器配置
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {resourceCards.map((card) => (
              <NetworkResourceCard key={card.key} {...card} count={cardCounts[card.key]} />
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
          <Settings className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-slate-900">先接入 iKuai 或 OpenWrt</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            未配置来源时首页只展示接入状态。保存数据源后，接口、终端、无线、防火墙和监控页面会自动成为日常工作入口。
          </p>
          <Button asChild className="mt-4 bg-cyan-700 hover:bg-cyan-800">
            <Link to="/cluster/network/config">去接入设置</Link>
          </Button>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">iKuai 数据源</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            当前用于终端流量、接口吞吐和连接数视图。最近更新：{updatedLabel(ikuaiDevice)}。
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">OpenWrt 接入</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            当前用于系统、接口、DHCP/邻居、无线、连接跟踪和 Exporter 覆盖。最近更新：{updatedLabel(openWrtDevice)}。
          </p>
        </div>
      </section>
    </div>
  );
};

export default NetworkDashboard;
