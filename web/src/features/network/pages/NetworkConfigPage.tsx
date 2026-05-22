import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Database, Loader2, Plug, Router, Save, Settings, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import { apiDelete, apiGetJson, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/auth-context";
import {
  deviceQueryHint,
  singleNetworkDeviceByKind,
  type NetworkDeviceKind,
  type SingletonNetworkDevice,
} from "@/features/network/components/networkDeviceSingleton";
import { formatDateTime } from "@/features/network/components/NetworkOpsPrimitives";
import OpenWrtActionPanel from "@/features/network/openwrt/pages/OpenWrtActionPanel";
import OpenWrtInstancePanel, { type OpenWrtTargetForm } from "@/features/network/openwrt/pages/OpenWrtTargetPanel";

const OPENWRT_PROBE_ENDPOINT = "/api/network/devices/openwrt/probe";
const IKUAI_PROBE_ENDPOINT = "/api/network/devices/ikuai/probe";

type NetworkDevice = SingletonNetworkDevice & {
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
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "ikuai",
    label: "iKuai 数据源",
    desc: "维护 Prometheus scope、instance、job 与备注。",
    icon: Router,
  },
  {
    key: "openwrt",
    label: "OpenWrt 接入",
    desc: "维护 SSH/API 地址、凭据、探测与设备操作。",
    icon: Wifi,
  },
  {
    key: "monitoring",
    label: "监控标签",
    desc: "核对 iKuai 与 OpenWrt 当前用于查询的标签。",
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

function ProviderSummary({
  label,
  kind,
  device,
}: {
  label: string;
  kind: NetworkDeviceKind;
  device?: NetworkDevice;
}) {
  const ready =
    kind === "ikuai"
      ? Boolean(device?.prometheusScope || device?.instanceLabel || device?.jobLabel)
      : Boolean(device?.host || device?.apiUrl || device?.passwordSet || device?.privateKeySet);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{label}</p>
          <p className="mt-1 truncate text-xs text-slate-500" title={kind === "ikuai" ? deviceQueryHint(device) : device?.host || device?.apiUrl || ""}>
            {kind === "ikuai" ? deviceQueryHint(device) : device?.host || device?.apiUrl || "未配置管理地址"}
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

function SectionNav({ active, onActiveChange }: { active: ConfigSection; onActiveChange: (section: ConfigSection) => void }) {
  return (
    <div className="grid gap-2">
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
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Router className="h-5 w-5 text-cyan-700" />
            iKuai 数据源
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">这里维护 Prometheus 查询标签，资源页会用它读取接口、终端和连接数据。</p>
        </div>
        <Badge variant={device ? "default" : "outline"}>{device ? "已保存" : "未配置"}</Badge>
      </div>

      <form
        className="mt-5 grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="grid gap-2">
          <Label>显示名称</Label>
          <Input
            value={form.name}
            disabled={!canWrite}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            placeholder="主路由 iKuai"
          />
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
            <Input
              value={form.host}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, host: event.target.value })}
              placeholder="192.168.1.1"
            />
          </div>
          <div className="grid gap-2">
            <Label>端口</Label>
            <Input
              value={form.port}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, port: event.target.value })}
              placeholder="80"
              inputMode="numeric"
            />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>账号</Label>
            <Input
              value={form.username}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, username: event.target.value })}
              placeholder="admin"
            />
          </div>
          <div className="grid gap-2">
            <Label>密码</Label>
            <Input
              value={form.password}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, password: event.target.value })}
              placeholder={device?.passwordSet ? "已保存，留空保持不变" : "iKuai 登录密码"}
              type="password"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <Checkbox
            checked={form.skipTlsVerify}
            disabled={!canWrite}
            onCheckedChange={(value) => onChange({ ...form, skipTlsVerify: value === true })}
          />
          skipTlsVerify
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label>Prometheus scope</Label>
            <Input
              value={form.prometheusScope}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, prometheusScope: event.target.value })}
              placeholder="network"
            />
          </div>
          <div className="grid gap-2">
            <Label>instance 标签</Label>
            <Input
              className="font-mono text-sm"
              value={form.instanceLabel}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, instanceLabel: event.target.value })}
              placeholder="192.168.1.1:9100"
            />
          </div>
          <div className="grid gap-2">
            <Label>job 标签</Label>
            <Input
              value={form.jobLabel}
              disabled={!canWrite}
              onChange={(event) => onChange({ ...form, jobLabel: event.target.value })}
              placeholder="可选"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>备注</Label>
          <Textarea
            value={form.notes}
            disabled={!canWrite}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            className="min-h-24 resize-none"
          />
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
          {device ? (
            <Button
              type="button"
              variant="outline"
              className="gap-2 text-red-700"
              disabled={!canWrite || deleting}
              onClick={() => onDelete(device.id)}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              删除 iKuai 实例
            </Button>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function MonitoringLabelsPanel({
  ikuaiDevice,
  openWrtDevice,
  onEdit,
}: {
  ikuaiDevice?: NetworkDevice;
  openWrtDevice?: NetworkDevice;
  onEdit: (section: ConfigSection) => void;
}) {
  const rows = [
    {
      provider: "iKuai",
      scope: ikuaiDevice?.prometheusScope || "network",
      instance: ikuaiDevice?.instanceLabel || "-",
      job: ikuaiDevice?.jobLabel || "-",
      updated: updatedLabel(ikuaiDevice),
      section: "ikuai" as const,
    },
    {
      provider: "OpenWrt",
      scope: openWrtDevice?.prometheusScope || "network",
      instance: openWrtDevice?.instanceLabel || "-",
      job: openWrtDevice?.jobLabel || "-",
      updated: updatedLabel(openWrtDevice),
      section: "openwrt" as const,
    },
  ];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Database className="h-5 w-5 text-cyan-700" />
            监控标签
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">资源页不会让你猜 Prometheus 查询条件；这里集中核对来源标签。</p>
        </div>
      </div>
      <div className="mt-5 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
            <tr>
              <th className="px-3 py-2">来源</th>
              <th className="px-3 py-2">scope</th>
              <th className="px-3 py-2">instance</th>
              <th className="px-3 py-2">job</th>
              <th className="px-3 py-2">最近更新</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.provider}>
                <td className="px-3 py-3 font-medium text-slate-900">{row.provider}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.scope}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.instance}</td>
                <td className="px-3 py-3 font-mono text-xs text-slate-600">{row.job}</td>
                <td className="px-3 py-3 text-xs text-slate-500">{row.updated}</td>
                <td className="px-3 py-3 text-right">
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(row.section)}>
                    编辑
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const NetworkConfigPage: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const [activeSection, setActiveSection] = useState<ConfigSection>("ikuai");
  const [ikuaiForm, setIkuaiForm] = useState<IkuaiForm>(() => defaultIkuaiForm());

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const devices = useMemo(() => devicesQ.data?.devices ?? [], [devicesQ.data?.devices]);
  const ikuaiDevice = useMemo(() => singleNetworkDeviceByKind(devices, "ikuai"), [devices]);
  const openWrtDevice = useMemo(() => singleNetworkDeviceByKind(devices, "openwrt"), [devices]);

  useEffect(() => {
    setIkuaiForm(defaultIkuaiForm(ikuaiDevice));
  }, [ikuaiDevice]);

  const invalidateDevices = () => qc.invalidateQueries({ queryKey: ["network-devices"] });

  const saveIkuai = useMutation({
    mutationFn: () =>
      apiPostJson<{ device: NetworkDevice }>("/api/network/devices", {
        kind: "ikuai",
        name: ikuaiForm.name.trim() || "主路由 iKuai",
        apiUrl: ikuaiForm.apiUrl.trim(),
        host: ikuaiForm.host.trim(),
        port: Number(ikuaiForm.port) || 0,
        authType: "http-web",
        username: ikuaiForm.username.trim(),
        password: ikuaiForm.password.trim(),
        skipTlsVerify: ikuaiForm.skipTlsVerify,
        prometheusScope: ikuaiForm.prometheusScope.trim() || "network",
        instanceLabel: ikuaiForm.instanceLabel.trim(),
        jobLabel: ikuaiForm.jobLabel.trim(),
        notes: ikuaiForm.notes.trim(),
      }),
    onSuccess: () => {
      toast.success("iKuai 实例已保存");
      void invalidateDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const probeIkuai = useMutation({
    mutationFn: () =>
      apiPostJson(IKUAI_PROBE_ENDPOINT, {
        kind: "ikuai",
        name: ikuaiForm.name.trim() || "主路由 iKuai",
        apiUrl: ikuaiForm.apiUrl.trim(),
        host: ikuaiForm.host.trim(),
        port: Number(ikuaiForm.port) || 0,
        authType: "http-web",
        username: ikuaiForm.username.trim(),
        password: ikuaiForm.password.trim(),
        skipTlsVerify: ikuaiForm.skipTlsVerify,
      }),
    onSuccess: () => toast.success("iKuai 探测完成"),
    onError: (error) => toast.error(String(error)),
  });

  const saveOpenWrt = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson("/api/network/devices", { kind: "openwrt", ...body }),
    onSuccess: () => {
      toast.success("OpenWrt 实例已保存");
      void invalidateDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const probeOpenWrt = useMutation({
    mutationFn: (body: OpenWrtTargetForm) => apiPostJson(OPENWRT_PROBE_ENDPOINT, body),
    onSuccess: () => toast.success("OpenWrt 探测完成"),
    onError: (error) => toast.error(String(error)),
  });

  const deleteDevice = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/network/devices/${encodeURIComponent(id)}`),
    onSuccess: () => {
      toast.success("网络实例已删除");
      void invalidateDevices();
    },
    onError: (error) => toast.error(String(error)),
  });

  const runOpenWrtAction = useMutation({
    mutationFn: ({ action, confirm }: { action: string; confirm?: boolean }) =>
      apiPostJson(`/api/network/devices/${encodeURIComponent(openWrtDevice?.id ?? "")}/openwrt/actions`, {
        action,
        confirm,
      }),
    onSuccess: () => toast.success("OpenWrt 操作已提交"),
    onError: (error) => toast.error(String(error)),
  });

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-6 pb-10">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Network Config</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Settings className="h-6 w-6 text-cyan-700" />
              网络配置
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              数据源、凭据和监控标签统一在这里维护。资源页面只负责查看和排障，不再把配置表单铺在主视图里。
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-slate-600">
            {canWrite ? "可编辑" : "只读"}
          </Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ProviderSummary label="iKuai 数据源" kind="ikuai" device={ikuaiDevice} />
        <ProviderSummary label="OpenWrt 接入" kind="openwrt" device={openWrtDevice} />
      </section>

      <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <SectionNav active={activeSection} onActiveChange={setActiveSection} />
        <div className="min-w-0 space-y-5">
          {devicesQ.isLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />
              正在读取网络配置...
            </div>
          ) : activeSection === "ikuai" ? (
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
            <>
              <OpenWrtInstancePanel
                device={openWrtDevice}
                activeId={openWrtDevice?.id ?? ""}
                canWrite={canWrite}
                loading={devicesQ.isFetching}
                probeEndpoint={OPENWRT_PROBE_ENDPOINT}
                creating={saveOpenWrt.isPending}
                probing={probeOpenWrt.isPending}
                deletingId={deleteDevice.variables}
                onCreate={(body) => saveOpenWrt.mutate(body)}
                onProbe={(body) => probeOpenWrt.mutate(body)}
                onDelete={(id) => deleteDevice.mutate(id)}
              />
              <OpenWrtActionPanel
                target={openWrtDevice}
                canWrite={canWrite}
                running={runOpenWrtAction.isPending}
                onAction={(action, confirm) => runOpenWrtAction.mutate({ action, confirm })}
              />
            </>
          ) : (
            <MonitoringLabelsPanel
              ikuaiDevice={ikuaiDevice}
              openWrtDevice={openWrtDevice}
              onEdit={setActiveSection}
            />
          )}
          {!canWrite ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              当前账号为只读权限，可以查看配置状态，但不能保存、探测、删除或执行 OpenWrt 操作。
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
            <div className="flex items-start gap-2">
              <Activity className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
              <p>
                配置保存后资源页会复用现有 API 重新汇总数据。Prometheus 查询仍按单实例语义执行，未配置的来源只显示接入状态和去配置入口。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NetworkConfigPage;
