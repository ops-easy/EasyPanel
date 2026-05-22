import { useEffect, useState } from "react";
import { Loader2, Plug, Trash2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import type { NetworkDevice } from "./OpenWrtWorkspace";

export type OpenWrtTargetForm = {
  name: string;
  apiUrl: string;
  host: string;
  port: number;
  authType: string;
  username: string;
  password: string;
  privateKey: string;
  prometheusScope: string;
  instanceLabel: string;
  jobLabel: string;
  notes: string;
};

const emptyForm: OpenWrtTargetForm = {
  name: "OpenWrt",
  apiUrl: "",
  host: "",
  port: 22,
  authType: "ssh-password",
  username: "root",
  password: "",
  privateKey: "",
  prometheusScope: "network",
  instanceLabel: "",
  jobLabel: "",
  notes: "",
};

type Props = {
  device?: NetworkDevice;
  activeId: string;
  canWrite: boolean;
  loading: boolean;
  probeEndpoint: string;
  creating: boolean;
  probing: boolean;
  deletingId?: string;
  onCreate: (body: OpenWrtTargetForm) => void;
  onProbe: (body: OpenWrtTargetForm) => void;
  onDelete: (id: string) => void;
};

export default function OpenWrtInstancePanel({
  device,
  canWrite,
  loading,
  probeEndpoint,
  creating,
  probing,
  deletingId,
  onCreate,
  onProbe,
  onDelete,
}: Props) {
  const [form, setForm] = useState<OpenWrtTargetForm>(emptyForm);
  const set = <K extends keyof OpenWrtTargetForm>(key: K, value: OpenWrtTargetForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (!device) return;
    setForm((prev) => ({
      ...prev,
      name: device.name || "OpenWrt",
      apiUrl: device.apiUrl || "",
      host: device.host || "",
      port: device.port || 22,
      authType: device.authType || "ssh-password",
      username: device.username || "root",
      password: "",
      privateKey: "",
      prometheusScope: device.prometheusScope || "network",
      instanceLabel: device.instanceLabel || "",
      jobLabel: device.jobLabel || "",
      notes: device.notes || "",
    }));
  }, [device]);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Plug className="mt-0.5 h-4 w-4 text-cyan-700" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">OpenWrt 当前实例</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{device?.host || device?.apiUrl || "配置 SSH 管理地址"}</p>
          </div>
        </div>
        <Badge variant={device ? "default" : "outline"}>{device ? "已配置" : "未配置"}</Badge>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>显示名称</Label>
          <Input value={form.name} disabled={!canWrite || loading} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>API 地址</Label>
          <Input value={form.apiUrl} disabled={!canWrite || loading} placeholder="https://router.lan" onChange={(e) => set("apiUrl", e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <div className="grid gap-2">
            <Label>SSH Host</Label>
            <Input value={form.host} disabled={!canWrite || loading} placeholder="192.168.1.1" onChange={(e) => set("host", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>端口</Label>
            <Input value={String(form.port)} disabled={!canWrite || loading} onChange={(e) => set("port", Number(e.target.value) || 22)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>账号</Label>
            <Input value={form.username} disabled={!canWrite || loading} onChange={(e) => set("username", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>密码</Label>
            <Input type="password" value={form.password} disabled={!canWrite || loading} onChange={(e) => set("password", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>私钥</Label>
          <Textarea value={form.privateKey} disabled={!canWrite || loading} rows={3} onChange={(e) => set("privateKey", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>Prometheus scope</Label>
            <Input value={form.prometheusScope} disabled={!canWrite || loading} onChange={(e) => set("prometheusScope", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>instance</Label>
            <Input value={form.instanceLabel} disabled={!canWrite || loading} onChange={(e) => set("instanceLabel", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>备注</Label>
          <Input value={form.notes} disabled={!canWrite || loading} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={!canWrite || probing} onClick={() => onProbe(form)} title={probeEndpoint}>
            {probing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            探测
          </Button>
          <Button type="button" disabled={!canWrite || creating} onClick={() => onCreate(form)}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            保存 OpenWrt 实例
          </Button>
        </div>
        {device ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2 text-red-700"
            disabled={!canWrite || deletingId === device.id}
            onClick={() => onDelete(device.id)}
          >
            {deletingId === device.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除 OpenWrt 实例
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export { OpenWrtInstancePanel };
