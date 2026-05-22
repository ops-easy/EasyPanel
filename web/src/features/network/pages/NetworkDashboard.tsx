import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  Network,
  RadioTower,
  RefreshCw,
  Router,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
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

type NetworkDevice = SingletonNetworkDevice & {
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

function defaultForm(kind: NetworkDeviceKind, device?: NetworkDevice): DeviceForm {
  return {
    name: device?.name ?? kindMeta[kind].fallbackName,
    prometheusScope: device?.prometheusScope ?? "network",
    instanceLabel: device?.instanceLabel ?? "",
    jobLabel: device?.jobLabel ?? "",
    notes: device?.notes ?? "",
  };
}

function configuredLabel(device?: NetworkDevice): string {
  return device ? "已配置" : "未配置";
}

function updatedLabel(device?: NetworkDevice): string {
  if (!device?.updatedAt) return "尚未保存";
  const date = new Date(device.updatedAt);
  if (Number.isNaN(date.getTime())) return device.updatedAt;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NetworkDashboard: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin";
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
  const ikuaiDevice = useMemo(
    () => singleNetworkDeviceByKind(devices, "ikuai"),
    [devices]
  );
  const openWrtDevice = useMemo(
    () => singleNetworkDeviceByKind(devices, "openwrt"),
    [devices]
  );
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

  const overviewQ = useQuery({
    queryKey: ["network-device-overview", selectedDevice?.id],
    queryFn: ({ signal }) =>
      apiGetJson<Record<string, unknown>>(`/api/network/devices/${selectedDevice?.id}/overview`, { signal }),
    enabled: Boolean(selectedDevice?.id),
    refetchInterval: selectedDevice?.id ? 60_000 : false,
  });

  const upsertDevice = useMutation({
    mutationFn: () =>
      apiPostJson<{ device: NetworkDevice }>("/api/network/devices", {
        kind: selectedKind,
        name: form.name.trim() || kindMeta[selectedKind].fallbackName,
        prometheusScope: form.prometheusScope.trim() || "network",
        instanceLabel: form.instanceLabel.trim(),
        jobLabel: form.jobLabel.trim(),
        notes: form.notes.trim(),
      }),
    onSuccess: () => {
      toast.success(`${kindMeta[selectedKind].label} 实例已保存`);
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

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="border-b border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Network className="h-6 w-6 text-cyan-700" />
              网络设备
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              iKuai 和 OpenWrt 各保留一个实例，保存新配置会覆盖同类型旧配置。
            </p>
          </div>
          <div className="grid min-w-[220px] grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-center">
            <div className="px-4 py-3">
              <p className="text-xs text-slate-500">已配置</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-slate-950">{configuredCount}/2</p>
            </div>
            <div className="border-l border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-500">当前编辑</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{kindMeta[selectedKind].label}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <IkuaiInstanceCard
          device={ikuaiDevice}
          selected={selectedKind === "ikuai"}
          deleting={deleteDevice.isPending}
          canWrite={canWrite}
          onSelect={() => setSelectedKind("ikuai")}
          onDelete={(id) => deleteDevice.mutate(id)}
        />
        <OpenWrtInstanceCard
          device={openWrtDevice}
          selected={selectedKind === "openwrt"}
          readyCount={openWrtReadyCount}
          status={openWrtStatusQ.data}
          statusLoading={openWrtStatusQ.isFetching}
          deleting={deleteDevice.isPending}
          canWrite={canWrite}
          onSelect={() => setSelectedKind("openwrt")}
          onRefresh={() => openWrtStatusQ.refetch()}
          onDelete={(id) => deleteDevice.mutate(id)}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Settings2 className="h-4 w-4 text-cyan-700" />
                新增网络设备
              </h2>
              <p className="mt-1 text-xs text-slate-500">保存后按类型覆盖旧实例</p>
            </div>
            <Badge variant="outline">{kindMeta[selectedKind].label}</Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(["ikuai", "openwrt"] as NetworkDeviceKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setSelectedKind(kind)}
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

          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              upsertDevice.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>显示名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={kindMeta[selectedKind].fallbackName}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prometheus scope</Label>
              <Input
                value={form.prometheusScope}
                onChange={(e) => setForm({ ...form, prometheusScope: e.target.value })}
                placeholder="network"
              />
            </div>
            <div className="space-y-1.5">
              <Label>instance 标签</Label>
              <Input
                className="font-mono text-sm"
                value={form.instanceLabel}
                onChange={(e) => setForm({ ...form, instanceLabel: e.target.value })}
                placeholder={selectedKind === "ikuai" ? "192.168.1.1:9100" : "openwrt:9100"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>job 标签</Label>
              <Input
                value={form.jobLabel}
                onChange={(e) => setForm({ ...form, jobLabel: e.target.value })}
                placeholder="可选"
              />
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="min-h-20 resize-none"
              />
            </div>
            <Button
              type="submit"
              className="w-full gap-2 bg-cyan-700 hover:bg-cyan-800"
              disabled={!canWrite || upsertDevice.isPending}
            >
              {upsertDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存 {kindMeta[selectedKind].label} 实例
            </Button>
          </form>
        </section>

        <main className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">当前实例</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {selectedDevice ? deviceQueryHint(selectedDevice) : `${kindMeta[selectedKind].label} 未配置`}
                </p>
              </div>
              {selectedDevice ? (
                <Button asChild variant="outline" size="sm" className="gap-1.5">
                  <Link to={kindMeta[selectedKind].route}>
                    打开面板
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
            <DeviceDetails
              device={selectedDevice}
              loading={devicesQ.isLoading}
              overview={overviewQ.data}
              overviewLoading={overviewQ.isFetching}
            />
          </section>

          {selectedKind === "openwrt" ? (
            <OpenWrtSignalPanel
              device={openWrtDevice}
              status={openWrtStatusQ.data}
              loading={openWrtStatusQ.isFetching}
              readyCount={openWrtReadyCount}
              onRefresh={() => openWrtStatusQ.refetch()}
            />
          ) : (
            <IkuaiSignalPanel device={ikuaiDevice} />
          )}
        </main>
      </div>
    </div>
  );
};

type InstanceCardProps = {
  device?: NetworkDevice;
  selected: boolean;
  canWrite: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: (id: string) => void;
};

function IkuaiInstanceCard({
  device,
  selected,
  canWrite,
  deleting,
  onSelect,
  onDelete,
}: InstanceCardProps) {
  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${selected ? "border-cyan-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
            <Router className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">iKuai 实例</h2>
            <p className="mt-1 text-xs text-slate-500">{device?.name ?? "等待配置"}</p>
          </div>
        </div>
        <Badge variant={device ? "default" : "outline"}>{configuredLabel(device)}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniFact label="scope" value={device?.prometheusScope ?? "network"} />
        <MiniFact label="instance" value={device?.instanceLabel || "未绑定"} mono />
        <MiniFact label="更新" value={updatedLabel(device)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={selected ? "default" : "outline"} size="sm" onClick={onSelect}>
          {selected ? "正在编辑" : device ? "编辑配置" : "配置 iKuai"}
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/cluster/network/ikuai/dashboard">
            <RadioTower className="h-4 w-4" />
            图表
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

function OpenWrtInstanceCard({
  device,
  selected,
  canWrite,
  deleting,
  readyCount,
  status,
  statusLoading,
  onSelect,
  onRefresh,
  onDelete,
}: InstanceCardProps & {
  readyCount: number;
  status?: OpenWrtStatus;
  statusLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${selected ? "border-cyan-300" : "border-slate-200"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
            <Wifi className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-950">OpenWrt 实例</h2>
            <p className="mt-1 text-xs text-slate-500">{device?.name ?? "等待配置"}</p>
          </div>
        </div>
        <Badge variant={device ? "default" : "outline"}>{configuredLabel(device)}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniFact label="scope" value={device?.prometheusScope ?? "network"} />
        <MiniFact label="instance" value={device?.instanceLabel || "未绑定"} mono />
        <MiniFact label="指标族" value={device ? `${readyCount}/${familyLabels.length}` : "未检测"} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={selected ? "default" : "outline"} size="sm" onClick={onSelect}>
          {selected ? "正在编辑" : device ? "编辑配置" : "配置 OpenWrt"}
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/cluster/network/openwrt/dashboard">
            <ShieldCheck className="h-4 w-4" />
            面板
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!device || statusLoading}
          onClick={onRefresh}
        >
          {statusLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          探测
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
      {device ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <CheckCircle2 className={`h-3.5 w-3.5 ${status?.prometheusConfigured ? "text-emerald-600" : "text-slate-400"}`} />
          {status?.prometheusConfigured ? "Prometheus 已发现 OpenWrt 指标" : "等待 Prometheus 指标"}
        </p>
      ) : null}
    </section>
  );
}

function IkuaiSignalPanel({ device }: { device?: NetworkDevice }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <Database className="h-4 w-4 text-cyan-700" />
        iKuai 数据源
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MiniFact label="实例" value={device?.name ?? "未配置"} />
        <MiniFact label="查询标签" value={deviceQueryHint(device)} mono />
        <MiniFact label="面板" value="iKuai 图表" />
      </div>
    </section>
  );
}

function OpenWrtSignalPanel({
  device,
  status,
  loading,
  readyCount,
  onRefresh,
}: {
  device?: NetworkDevice;
  status?: OpenWrtStatus;
  loading: boolean;
  readyCount: number;
  onRefresh: () => void;
}) {
  const hints = status?.missingHints ?? [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          OpenWrt 指标族
        </h2>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={!device || loading} onClick={onRefresh}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {familyLabels.map(([key, label]) => (
          <div key={key} className="rounded-md border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`mt-1 text-sm font-semibold ${status?.families?.[key] ? "text-emerald-700" : "text-slate-500"}`}>
              {status?.families?.[key] ? "已发现" : "未发现"}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        已发现 {readyCount}/{familyLabels.length} 类指标。{hints.length > 0 ? hints.join("；") : "暂无缺失提示"}
      </p>
    </section>
  );
}

function DeviceDetails({
  device,
  loading,
  overview,
  overviewLoading,
}: {
  device?: NetworkDevice;
  loading: boolean;
  overview?: Record<string, unknown>;
  overviewLoading: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 px-3 py-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载实例...
      </div>
    );
  }

  if (!device) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500">
        当前类型还没有保存实例
      </div>
    );
  }

  const rows: Array<[string, React.ReactNode]> = [
    ["ID", device.id],
    ["名称", device.name],
    ["类型", device.kind],
    ["Prometheus scope", device.prometheusScope],
    ["instance", device.instanceLabel || "-"],
    ["job", device.jobLabel || "-"],
    ["备注", device.notes || "-"],
    ["更新", updatedLabel(device)],
  ];

  return (
    <div className="mt-4 space-y-4">
      <div className="overflow-hidden rounded-md border border-slate-200">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[150px_1fr] border-b border-slate-100 last:border-b-0">
            <div className="bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">{label}</div>
            <div className="break-all px-3 py-2 font-mono text-xs text-slate-800">{value}</div>
          </div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500">概览响应</p>
        <pre className="max-h-52 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-100">
          {overviewLoading ? "刷新中..." : JSON.stringify(overview ?? {}, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function MiniFact({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-slate-950 ${mono ? "font-mono" : ""}`} title={String(value ?? "")}>
        {value}
      </p>
    </div>
  );
}

export default NetworkDashboard;
