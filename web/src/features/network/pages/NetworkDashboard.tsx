import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Cable,
  Gauge,
  Loader2,
  Network,
  RadioTower,
  RefreshCw,
  Router,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import {
  deviceQueryHint,
  singleNetworkDeviceByKind,
  type NetworkDeviceKind,
  type SingletonNetworkDevice,
} from "@/features/network/components/networkDeviceSingleton";
import {
  formatDateTime,
  NetworkMetricCard,
  NetworkStatusBadge,
  RawDataDisclosure,
} from "@/features/network/components/NetworkOpsPrimitives";

type NetworkDevice = SingletonNetworkDevice & {
  apiUrl?: string;
  host?: string;
  port?: number;
  username?: string;
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
  source?: string;
};

type DeviceForm = {
  name: string;
  prometheusScope: string;
  instanceLabel: string;
  jobLabel: string;
  notes: string;
};

const kindMeta: Record<
  NetworkDeviceKind,
  {
    label: string;
    fallbackName: string;
    route: string;
    icon: React.ReactNode;
  }
> = {
  ikuai: {
    label: "iKuai",
    fallbackName: "主路由 iKuai",
    route: "/cluster/network/ikuai/dashboard",
    icon: <Router className="h-5 w-5" />,
  },
  openwrt: {
    label: "OpenWrt",
    fallbackName: "旁路由 OpenWrt",
    route: "/cluster/network/openwrt/dashboard",
    icon: <Wifi className="h-5 w-5" />,
  },
};

const familyLabels: Array<[keyof OpenWrtFamilies, string]> = [
  ["system", "系统"],
  ["interfaces", "接口"],
  ["dhcp", "DHCP/邻居"],
  ["wifi", "Wi-Fi"],
  ["netstat", "连接"],
];

const networkQuickLinks = [
  { label: "iKuai 总览", to: "/cluster/network/ikuai/dashboard", icon: Router },
  { label: "iKuai 接口", to: "/cluster/network/ikuai/interfaces", icon: Cable },
  { label: "iKuai 客户端", to: "/cluster/network/ikuai/clients", icon: Users },
  { label: "OpenWrt 总览", to: "/cluster/network/openwrt/dashboard", icon: Wifi },
  { label: "OpenWrt 接口", to: "/cluster/network/openwrt/interfaces", icon: RadioTower },
  { label: "连接跟踪", to: "/cluster/network/openwrt/connections", icon: Activity },
  { label: "数据源", to: "/cluster/network/openwrt/exporter", icon: Gauge },
] as const;

function defaultForm(kind: NetworkDeviceKind, device?: NetworkDevice): DeviceForm {
  return {
    name: device?.name ?? kindMeta[kind].fallbackName,
    prometheusScope: device?.prometheusScope ?? "network",
    instanceLabel: device?.instanceLabel ?? "",
    jobLabel: device?.jobLabel ?? "",
    notes: device?.notes ?? "",
  };
}

function updatedLabel(device?: NetworkDevice): string {
  if (!device?.updatedAt) return "尚未保存";
  return formatDateTime(device.updatedAt);
}

const NetworkDashboard: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const canViewRaw = status?.role === "admin";
  const [params] = useSearchParams();
  const kindParam = params.get("kind");
  const [selectedKind, setSelectedKind] = useState<NetworkDeviceKind>(
    kindParam === "openwrt" ? "openwrt" : "ikuai"
  );
  const [form, setForm] = useState<DeviceForm>(() => defaultForm(selectedKind));

  useEffect(() => {
    if (kindParam === "openwrt" || kindParam === "ikuai") {
      setSelectedKind(kindParam);
    }
  }, [kindParam]);

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  const devices = useMemo(() => devicesQ.data?.devices ?? [], [devicesQ.data?.devices]);
  const ikuaiDevice = useMemo(() => singleNetworkDeviceByKind(devices, "ikuai"), [devices]);
  const openWrtDevice = useMemo(() => singleNetworkDeviceByKind(devices, "openwrt"), [devices]);
  const selectedDevice = selectedKind === "ikuai" ? ikuaiDevice : openWrtDevice;

  useEffect(() => {
    setForm(defaultForm(selectedKind, selectedDevice));
  }, [selectedKind, selectedDevice]);

  const openWrtStatusQ = useQuery({
    queryKey: ["network-device-exporter-status", openWrtDevice?.id],
    queryFn: ({ signal }) =>
      apiGetJson<OpenWrtStatus>(`/api/network/devices/${openWrtDevice?.id}/exporter-status`, { signal }),
    enabled: Boolean(openWrtDevice?.id),
    refetchInterval: openWrtDevice?.id ? 60_000 : false,
  });

  const upsertIkuaiDevice = useMutation({
    mutationFn: () =>
      apiPostJson<{ device: NetworkDevice }>("/api/network/devices", {
        kind: "ikuai",
        name: form.name.trim() || kindMeta.ikuai.fallbackName,
        prometheusScope: form.prometheusScope.trim() || "network",
        instanceLabel: form.instanceLabel.trim(),
        jobLabel: form.jobLabel.trim(),
        notes: form.notes.trim(),
      }),
    onSuccess: () => {
      toast.success("iKuai 实例已保存");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("网络实例已删除");
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  const families = openWrtStatusQ.data?.families ?? {};
  const openWrtReadyCount = familyLabels.filter(([key]) => Boolean(families[key])).length;
  const configuredCount = Number(Boolean(ikuaiDevice)) + Number(Boolean(openWrtDevice));
  const sshReady = Boolean(openWrtDevice?.passwordSet || openWrtDevice?.privateKeySet);

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Network className="h-6 w-6 text-cyan-700" />
              网络设备
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              统一接管 iKuai 与 OpenWrt：这里看配置、健康和入口，子页面负责接口、客户端、无线、连接跟踪与监控数据。
            </p>
          </div>
          <div className="grid min-w-[260px] grid-cols-2 gap-3">
            <NetworkMetricCard label="已配置" value={`${configuredCount}/2`} hint="iKuai / OpenWrt" tone="cyan" />
            <NetworkMetricCard label="OpenWrt 指标族" value={`${openWrtReadyCount}/5`} hint="Prometheus" tone="emerald" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <IkuaiInstanceCard
          device={ikuaiDevice}
          selected={selectedKind === "ikuai"}
          statusOk={Boolean(ikuaiDevice?.instanceLabel || ikuaiDevice?.jobLabel)}
          statusLabel={ikuaiDevice ? "已登记" : "未配置"}
          details={[
            ["数据源", deviceQueryHint(ikuaiDevice)],
            ["最近更新", updatedLabel(ikuaiDevice)],
            ["备注", ikuaiDevice?.notes || "-"],
          ]}
          canWrite={canWrite}
          deleting={deleteDevice.isPending}
          onSelect={() => setSelectedKind("ikuai")}
          onDelete={(id) => deleteDevice.mutate(id)}
        />
        <OpenWrtInstanceCard
          device={openWrtDevice}
          selected={selectedKind === "openwrt"}
          statusOk={Boolean(openWrtDevice && sshReady)}
          statusLabel={openWrtDevice ? (sshReady ? "SSH 可管理" : "缺少凭据") : "OpenWrt 未配置"}
          details={[
            ["管理地址", openWrtDevice?.host || openWrtDevice?.apiUrl || "配置 OpenWrt"],
            ["指标族", openWrtDevice ? `${openWrtReadyCount}/${familyLabels.length}` : "-"],
            ["最近更新", updatedLabel(openWrtDevice)],
          ]}
          canWrite={canWrite}
          deleting={deleteDevice.isPending}
          onSelect={() => setSelectedKind("openwrt")}
          onDelete={(id) => deleteDevice.mutate(id)}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <DeviceConfigurationPanel
          selectedKind={selectedKind}
          form={form}
          canWrite={canWrite}
          saving={upsertIkuaiDevice.isPending}
          onSelect={setSelectedKind}
          onChange={setForm}
          onSubmit={() => upsertIkuaiDevice.mutate()}
        />

        <div className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">接管入口</h2>
                <p className="mt-1 text-xs text-slate-500">
                  当前关注：{kindMeta[selectedKind].label} · {selectedDevice ? deviceQueryHint(selectedDevice) : "未配置"}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <Link to={kindMeta[selectedKind].route}>
                  打开面板
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {networkQuickLinks.map(({ label, to, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-sm font-medium text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-900"
                >
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-cyan-700" />
                    <span className="truncate">{label}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" />
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                OpenWrt 指标族
              </h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!openWrtDevice || openWrtStatusQ.isFetching}
                onClick={() => openWrtStatusQ.refetch()}
              >
                {openWrtStatusQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新
              </Button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-5">
              {familyLabels.map(([key, label]) => (
                <div key={key} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <div className="mt-2">
                    <NetworkStatusBadge ok={openWrtDevice ? Boolean(families[key]) : undefined} label={families[key] ? "已发现" : "缺失"} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {openWrtDevice
                ? openWrtStatusQ.data?.missingHints?.join("；") || "指标覆盖正常，未发现缺失提示。"
                : "配置 OpenWrt 后会自动检查系统、接口、DHCP/邻居、Wi-Fi 和连接指标。"}
            </div>
            <RawDataDisclosure value={openWrtStatusQ.data} visible={canViewRaw} />
          </section>
        </div>
      </section>
    </div>
  );
};

type DeviceOverviewCardProps = {
  kind: NetworkDeviceKind;
  device?: NetworkDevice;
  selected: boolean;
  statusOk: boolean;
  statusLabel: string;
  details: Array<[string, React.ReactNode]>;
  canWrite: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
};

function IkuaiInstanceCard(props: Omit<DeviceOverviewCardProps, "kind">) {
  return <DeviceOverviewCard kind="ikuai" {...props} />;
}

function OpenWrtInstanceCard(props: Omit<DeviceOverviewCardProps, "kind">) {
  return <DeviceOverviewCard kind="openwrt" {...props} />;
}

function DeviceOverviewCard({
  kind,
  device,
  selected,
  statusOk,
  statusLabel,
  details,
  canWrite,
  deleting,
  onSelect,
  onDelete,
}: DeviceOverviewCardProps) {
  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${selected ? "border-cyan-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
            {kindMeta[kind].icon}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">{kindMeta[kind].label} 实例</h2>
            <p className="mt-1 text-xs text-slate-500">{device?.name ?? (kind === "openwrt" ? "OpenWrt 未配置" : "等待配置")}</p>
          </div>
        </div>
        <NetworkStatusBadge ok={device ? statusOk : undefined} label={statusLabel} />
      </div>

      <div className="mt-4 grid gap-2">
        {details.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[88px_1fr] gap-3 rounded-md bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-500">{label}</span>
            <span className="truncate font-medium text-slate-800" title={String(value ?? "")}>{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={selected ? "default" : "outline"} size="sm" onClick={onSelect}>
          {selected ? "正在查看" : device ? "查看状态" : `配置 ${kindMeta[kind].label}`}
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to={kindMeta[kind].route}>
            <RadioTower className="h-4 w-4" />
            进入工作区
          </Link>
        </Button>
        {device ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-red-700"
            disabled={!canWrite || deleting}
            onClick={() => onDelete(device.id)}
          >
            <Trash2 className="h-4 w-4" />
            删除
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function DeviceConfigurationPanel({
  selectedKind,
  form,
  canWrite,
  saving,
  onSelect,
  onChange,
  onSubmit,
}: {
  selectedKind: NetworkDeviceKind;
  form: DeviceForm;
  canWrite: boolean;
  saving: boolean;
  onSelect: (kind: NetworkDeviceKind) => void;
  onChange: (form: DeviceForm) => void;
  onSubmit: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Settings2 className="h-4 w-4 text-cyan-700" />
            新增网络设备
          </h2>
          <p className="mt-1 text-xs text-slate-500">iKuai 数据源在这里维护 Prometheus 标签；OpenWrt 在工作区维护 SSH 凭据。</p>
        </div>
        <Badge variant="outline">{kindMeta[selectedKind].label}</Badge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["ikuai", "openwrt"] as NetworkDeviceKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onSelect(kind)}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
              selectedKind === kind
                ? "border-cyan-300 bg-cyan-50 text-cyan-950"
                : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {kindMeta[kind].icon}
            {kindMeta[kind].label}
          </button>
        ))}
      </div>

      {selectedKind === "openwrt" ? (
        <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
          <p className="font-medium">配置 OpenWrt</p>
          <p className="mt-1 text-xs text-cyan-900">
            OpenWrt 需要 SSH Host、端口和凭据。请进入 OpenWrt 工作区保存完整目标后，再回到总览查看健康状态。
          </p>
          <Button asChild className="mt-3 gap-2 bg-cyan-700 hover:bg-cyan-800">
            <Link to="/cluster/network/openwrt/dashboard">
              打开 OpenWrt 配置
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-1.5">
            <Label>显示名称</Label>
            <Input
              value={form.name}
              disabled={!canWrite}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder={kindMeta.ikuai.fallbackName}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prometheus scope</Label>
            <Input
              value={form.prometheusScope}
              disabled={!canWrite}
              onChange={(e) => onChange({ ...form, prometheusScope: e.target.value })}
              placeholder="network"
            />
          </div>
          <div className="space-y-1.5">
            <Label>instance 标签</Label>
            <Input
              className="font-mono text-sm"
              value={form.instanceLabel}
              disabled={!canWrite}
              onChange={(e) => onChange({ ...form, instanceLabel: e.target.value })}
              placeholder="192.168.1.1:9100"
            />
          </div>
          <div className="space-y-1.5">
            <Label>job 标签</Label>
            <Input
              value={form.jobLabel}
              disabled={!canWrite}
              onChange={(e) => onChange({ ...form, jobLabel: e.target.value })}
              placeholder="可选"
            />
          </div>
          <div className="space-y-1.5">
            <Label>备注</Label>
            <Textarea
              value={form.notes}
              disabled={!canWrite}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              className="min-h-20 resize-none"
            />
          </div>
          <Button type="submit" className="w-full gap-2 bg-cyan-700 hover:bg-cyan-800" disabled={!canWrite || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存 iKuai 实例
          </Button>
        </form>
      )}
    </section>
  );
}

export default NetworkDashboard;
