import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Loader2, Plug, Router, Save, Settings, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { apiDelete, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNetworkDevices } from "@/features/network/hooks/useNetworkDevices";
import { deviceQueryHint, type NetworkDeviceKind } from "@/features/network/components/networkDeviceSingleton";
import { formatDateTime } from "@/features/network/components/NetworkOpsPrimitives";
import type { NetworkDevice } from "@/features/network/model/networkTypes";
import OpenWrtInstancePanel, { type OpenWrtTargetForm } from "@/features/network/openwrt/pages/OpenWrtTargetPanel";

const OPENWRT_PROBE_ENDPOINT = "/api/network/devices/openwrt/probe";
const IKUAI_PROBE_ENDPOINT = "/api/network/devices/ikuai/probe";

type ConfigSection = "ikuai" | "openwrt" | "monitoring";

type IkuaiForm = {
  name: string;
  apiUrl: string;
  host: string;
  port: string;
  username: string;
  password: string;
  skipTlsVerify: boolean;
  prometheusScope: string;
  instanceLabel: string;
  jobLabel: string;
  notes: string;
};

const sectionItems: Array<{
  key: ConfigSection;
  label: string;
  desc: string;
  icon: typeof Router;
}> = [
  {
    key: "ikuai",
    label: "iKuai 数据源",
    desc: "维护 HTTP Web/API 地址、登录凭据和 Prometheus 查询标签。",
    icon: Router,
  },
  {
    key: "openwrt",
    label: "OpenWrt 接入",
    desc: "维护 SSH/API 地址、账号凭据、探测状态和监控标签。",
    icon: Wifi,
  },
  {
    key: "monitoring",
    label: "监控标签",
    desc: "核对 iKuai 与 OpenWrt 当前用于查询的 Prometheus 标签。",
    icon: Database,
  },
];

function defaultIkuaiForm(device?: NetworkDevice): IkuaiForm {
  return {
    name: device?.name || "主路由 iKuai",
    apiUrl: device?.apiUrl || "",
    host: device?.host || "",
    port: device?.port ? String(device.port) : "",
    username: device?.username || "admin",
    password: "",
    skipTlsVerify: Boolean(device?.skipTlsVerify),
    prometheusScope: device?.prometheusScope || "network",
    instanceLabel: device?.instanceLabel || "",
    jobLabel: device?.jobLabel || "",
    notes: device?.notes || "",
  };
}

function updatedLabel(device?: NetworkDevice): string {
  return device?.updatedAt ? formatDateTime(device.updatedAt) : "尚未保存";
}

function providerReady(kind: NetworkDeviceKind, device?: NetworkDevice): boolean {
  if (!device) return false;
  if (kind === "ikuai") return Boolean(device.apiUrl || device.host || device.instanceLabel || device.jobLabel || device.prometheusScope);
  return Boolean(device.host || device.apiUrl || device.passwordSet || device.privateKeySet);
}

function ProviderSummary({
  kind,
  label,
  device,
}: {
  kind: NetworkDeviceKind;
  label: string;
  device?: NetworkDevice;
}) {
  const ready = providerReady(kind, device);
  const hint = kind === "ikuai" ? device?.apiUrl || device?.host || deviceQueryHint(device) : device?.host || device?.apiUrl || "未配置管理地址";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={hint}>
            {hint}
          </p>
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
      <p className="mt-3 text-xs text-slate-500">最近更新：{updatedLabel(device)}</p>
    </div>
  );
}

function SectionNav({
  active,
  onActiveChange,
}: {
  active: ConfigSection;
  onActiveChange: (section: ConfigSection) => void;
}) {
  return (
    <div className="grid content-start gap-2 self-start">
      {sectionItems.map((item) => {
        const Icon = item.icon;
        const selected = active === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onActiveChange(item.key)}
            className={cn(
              "flex min-w-0 items-start gap-3 rounded-xl border bg-white p-4 text-left shadow-sm transition",
              selected ? "border-cyan-300 ring-2 ring-cyan-100" : "border-slate-200 hover:border-slate-300"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                selected ? "border-cyan-200 bg-cyan-50 text-cyan-700" : "border-slate-200 bg-slate-50 text-slate-500"
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-950">{item.label}</span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">{item.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function IkuaiConfigPanel({
  device,
  form,
  canWrite,
  saving,
  probing,
  deleting,
  onChange,
  onSave,
  onProbe,
  onDelete,
}: {
  device?: NetworkDevice;
  form: IkuaiForm;
  canWrite: boolean;
  saving: boolean;
  probing: boolean;
  deleting: boolean;
  onChange: (form: IkuaiForm) => void;
  onSave: () => void;
  onProbe: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Router className="h-5 w-5 text-cyan-700" />
            iKuai 数据源
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            这里保存平台访问 iKuai Web/API 与 Prometheus 的接入信息。终端备注、限速、端口映射等路由器配置接管入口请从资源页进入。
          </p>
        </div>
        <Badge variant={device ? "default" : "outline"}>{device ? "已保存" : "未配置"}</Badge>
      </div>

      <form
        className="mt-5 grid min-w-0 gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="grid gap-2">
          <Label>显示名称</Label>
          <Input value={form.name} disabled={!canWrite} onChange={(event) => onChange({ ...form, name: event.target.value })} />
        </div>
        <div className="grid gap-2">
          <Label>iKuai 管理地址</Label>
          <Input
            value={form.apiUrl}
            disabled={!canWrite}
            onChange={(event) => onChange({ ...form, apiUrl: event.target.value })}
            placeholder="https://ikuai.lan"
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="grid gap-2">
            <Label>Host</Label>
            <Input value={form.host} disabled={!canWrite} onChange={(event) => onChange({ ...form, host: event.target.value })} placeholder="192.168.1.1" />
          </div>
          <div className="grid gap-2">
            <Label>端口</Label>
            <Input value={form.port} disabled={!canWrite} onChange={(event) => onChange({ ...form, port: event.target.value })} placeholder="80" inputMode="numeric" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-2">
            <Label>账号</Label>
            <Input value={form.username} disabled={!canWrite} onChange={(event) => onChange({ ...form, username: event.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>密码</Label>
            <Input
              type="password"
              value={form.password}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              placeholder={device?.passwordSet ? "已保存，留空保持不变" : "iKuai 登录密码"}
            />
          </div>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
          <Checkbox checked={form.skipTlsVerify} disabled={!canWrite} onCheckedChange={(value) => onChange({ ...form, skipTlsVerify: value === true })} />
          跳过 TLS 校验
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Prometheus scope</Label>
            <Input value={form.prometheusScope} disabled={!canWrite} onChange={(event) => onChange({ ...form, prometheusScope: event.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label>instance 标签</Label>
            <Input value={form.instanceLabel} disabled={!canWrite} onChange={(event) => onChange({ ...form, instanceLabel: event.target.value })} placeholder="192.168.1.1:9100" />
          </div>
          <div className="grid gap-2">
            <Label>job 标签</Label>
            <Input value={form.jobLabel} disabled={!canWrite} onChange={(event) => onChange({ ...form, jobLabel: event.target.value })} placeholder="可选" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>备注</Label>
          <Textarea value={form.notes} disabled={!canWrite} onChange={(event) => onChange({ ...form, notes: event.target.value })} className="min-h-24" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" className="gap-2" disabled={!canWrite || probing} onClick={onProbe}>
            {probing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            探测 iKuai
          </Button>
          <Button type="submit" className="gap-2 bg-cyan-700 hover:bg-cyan-800" disabled={!canWrite || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            保存 iKuai 实例
          </Button>
        </div>
        {device ? (
          <Button type="button" variant="outline" className="gap-2 text-red-700" disabled={!canWrite || deleting} onClick={() => onDelete(device.id)}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除 iKuai 实例
          </Button>
        ) : null}
      </form>
    </section>
  );
}

function MonitoringLabelsPanel({ ikuaiDevice, openWrtDevice }: { ikuaiDevice?: NetworkDevice; openWrtDevice?: NetworkDevice }) {
  const rows = [
    { label: "iKuai", device: ikuaiDevice, address: ikuaiDevice?.apiUrl || ikuaiDevice?.host || "未接入" },
    { label: "OpenWrt", device: openWrtDevice, address: openWrtDevice?.host || openWrtDevice?.apiUrl || "未接入" },
  ];
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
        <Database className="h-5 w-5 text-cyan-700" />
        监控标签
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">资源页会按这些标签查询 Prometheus；这里只做接入信息核对。</p>
      <div className="mt-4 grid gap-3">
        {rows.map((row) => (
          <div key={row.label} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-950">{row.label}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{row.address}</p>
              </div>
              <Badge variant="outline" className={row.device ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-white text-slate-600"}>
                {row.device ? "已接入" : "未接入"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
              <span>scope：{row.device?.prometheusScope || "network"}</span>
              <span>instance：{row.device?.instanceLabel || "-"}</span>
              <span>job：{row.device?.jobLabel || "-"}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function NetworkConfigPage() {
  const queryClient = useQueryClient();
  const { query: devicesQ, ikuaiDevice, openWrtDevice, canWrite } = useNetworkDevices();
  const [activeSectionTouched, setActiveSectionTouched] = useState(false);
  const [activeSection, setActiveSection] = useState<ConfigSection>("ikuai");
  const [ikuaiForm, setIkuaiForm] = useState<IkuaiForm>(() => defaultIkuaiForm());

  useEffect(() => {
    setIkuaiForm(defaultIkuaiForm(ikuaiDevice));
  }, [ikuaiDevice]);

  useEffect(() => {
    if (activeSectionTouched) return;
    if (!ikuaiDevice && openWrtDevice) {
      setActiveSection("openwrt");
    } else if (ikuaiDevice) {
      setActiveSection("ikuai");
    }
  }, [activeSectionTouched, ikuaiDevice, openWrtDevice]);

  const handleSectionChange = (section: ConfigSection) => {
    setActiveSectionTouched(true);
    setActiveSection(section);
  };

  const refreshDevices = () => {
    void queryClient.invalidateQueries({ queryKey: ["network-devices"] });
  };

  const saveIkuai = useMutation({
    mutationFn: () =>
      apiPostJson<{ device: NetworkDevice }>("/api/network/devices", {
        kind: "ikuai",
        authType: "http-web",
        name: ikuaiForm.name,
        apiUrl: ikuaiForm.apiUrl,
        host: ikuaiForm.host,
        port: Number(ikuaiForm.port) || undefined,
        username: ikuaiForm.username,
        password: ikuaiForm.password,
        skipTlsVerify: ikuaiForm.skipTlsVerify,
        prometheusScope: ikuaiForm.prometheusScope || "network",
        instanceLabel: ikuaiForm.instanceLabel,
        jobLabel: ikuaiForm.jobLabel,
        notes: ikuaiForm.notes,
      }),
    onSuccess: () => {
      toast.success("iKuai 接入信息已保存");
      refreshDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const probeIkuai = useMutation({
    mutationFn: () =>
      apiPostJson(IKUAI_PROBE_ENDPOINT, {
        kind: "ikuai",
        authType: "http-web",
        apiUrl: ikuaiForm.apiUrl,
        host: ikuaiForm.host,
        port: Number(ikuaiForm.port) || undefined,
        username: ikuaiForm.username,
        password: ikuaiForm.password,
        skipTlsVerify: ikuaiForm.skipTlsVerify,
        prometheusScope: ikuaiForm.prometheusScope || "network",
        instanceLabel: ikuaiForm.instanceLabel,
        jobLabel: ikuaiForm.jobLabel,
      }),
    onSuccess: () => toast.success("iKuai 探测完成"),
    onError: (error) => toast.error(String(error)),
  });

  const saveOpenWrt = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson("/api/network/devices", { kind: "openwrt", ...body }),
    onSuccess: () => {
      toast.success("OpenWrt 接入信息已保存");
      refreshDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const probeOpenWrt = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson(OPENWRT_PROBE_ENDPOINT, { kind: "openwrt", ...body }),
    onSuccess: () => toast.success("OpenWrt 探测完成"),
    onError: (error) => toast.error(String(error)),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("网络实例已删除");
      refreshDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const headerStatus = useMemo(() => {
    const count = Number(Boolean(ikuaiDevice)) + Number(Boolean(openWrtDevice));
    return `${count}/2`;
  }, [ikuaiDevice, openWrtDevice]);

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] min-w-0 space-y-5 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network Config</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Settings className="h-6 w-6 text-cyan-700" />
              网络配置
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              本页只维护平台接入信息：管理地址、凭据和监控标签。路由器配置接管入口请从资源页进入，避免接入和日常运维混在一起。
            </p>
          </div>
          <Badge variant="outline" className="w-fit bg-white text-slate-700">
            接入信息 {headerStatus}
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <ProviderSummary kind="ikuai" label="iKuai 数据源" device={ikuaiDevice} />
        <ProviderSummary kind="openwrt" label="OpenWrt 接入" device={openWrtDevice} />
      </section>

      {!canWrite ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          当前账号只读，可以查看接入信息，不能保存、探测或删除。
        </section>
      ) : null}

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] items-start">
        <SectionNav active={activeSection} onActiveChange={handleSectionChange} />
        <div className="min-w-0 overflow-hidden space-y-5">
          {activeSection === "ikuai" ? (
            <IkuaiConfigPanel
              device={ikuaiDevice}
              form={ikuaiForm}
              canWrite={canWrite}
              saving={saveIkuai.isPending}
              probing={probeIkuai.isPending}
              deleting={deleteDevice.isPending && deleteDevice.variables === ikuaiDevice?.id}
              onChange={setIkuaiForm}
              onSave={() => saveIkuai.mutate()}
              onProbe={() => probeIkuai.mutate()}
              onDelete={(id) => deleteDevice.mutate(id)}
            />
          ) : activeSection === "openwrt" ? (
            <OpenWrtInstancePanel
              device={openWrtDevice}
              activeId={openWrtDevice?.id || ""}
              canWrite={canWrite}
              loading={devicesQ.isLoading}
              probeEndpoint={OPENWRT_PROBE_ENDPOINT}
              creating={saveOpenWrt.isPending}
              probing={probeOpenWrt.isPending}
              deletingId={deleteDevice.isPending ? String(deleteDevice.variables || "") : undefined}
              onCreate={(body) => saveOpenWrt.mutate(body)}
              onProbe={(body) => probeOpenWrt.mutate(body)}
              onDelete={(id) => deleteDevice.mutate(id)}
            />
          ) : (
            <MonitoringLabelsPanel ikuaiDevice={ikuaiDevice} openWrtDevice={openWrtDevice} />
          )}
        </div>
      </section>
    </div>
  );
}
