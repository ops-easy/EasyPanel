import { useState } from "react";
import { Loader2, Plug, Trash2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
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
  devices: NetworkDevice[];
  activeId: string;
  canWrite: boolean;
  loading: boolean;
  probeEndpoint: string;
  creating: boolean;
  probing: boolean;
  deletingId?: string;
  onActiveChange: (id: string) => void;
  onCreate: (body: OpenWrtTargetForm) => void;
  onProbe: (body: OpenWrtTargetForm) => void;
  onDelete: (id: string) => void;
};

export default function OpenWrtTargetPanel({
  devices,
  activeId,
  canWrite,
  loading,
  probeEndpoint,
  creating,
  probing,
  deletingId,
  onActiveChange,
  onCreate,
  onProbe,
  onDelete,
}: Props) {
  const [form, setForm] = useState<OpenWrtTargetForm>(emptyForm);
  const set = <K extends keyof OpenWrtTargetForm>(key: K, value: OpenWrtTargetForm[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-cyan-700" />
          <h2 className="text-sm font-semibold text-slate-950">OpenWrt 目标</h2>
        </div>
        <Badge variant="outline">{devices.length}</Badge>
      </div>

      <div className="mb-4 overflow-auto rounded border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>凭据</TableHead>
              <TableHead className="w-16">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                  加载中...
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && devices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">
                  暂无 OpenWrt 目标
                </TableCell>
              </TableRow>
            ) : null}
            {!loading
              ? devices.map((dev) => (
                  <TableRow
                    key={dev.id}
                    className={dev.id === activeId ? "bg-cyan-50" : "cursor-pointer"}
                    onClick={() => onActiveChange(dev.id)}
                  >
                    <TableCell className="font-medium">{dev.name}</TableCell>
                    <TableCell className="font-mono text-xs">{dev.host || dev.apiUrl || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={dev.passwordSet || dev.privateKeySet ? "default" : "outline"}>
                        {dev.passwordSet || dev.privateKeySet ? "已保存" : "缺失"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!canWrite || deletingId === dev.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onDelete(dev.id);
                        }}
                        title="删除"
                      >
                        {deletingId === dev.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3">
        <div className="grid gap-2">
          <Label>显示名称</Label>
          <Input value={form.name} disabled={!canWrite} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label>API 地址</Label>
          <Input value={form.apiUrl} disabled={!canWrite} placeholder="https://router.lan" onChange={(e) => set("apiUrl", e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <div className="grid gap-2">
            <Label>SSH Host</Label>
            <Input value={form.host} disabled={!canWrite} placeholder="192.168.1.1" onChange={(e) => set("host", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>端口</Label>
            <Input value={String(form.port)} disabled={!canWrite} onChange={(e) => set("port", Number(e.target.value) || 22)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>账号</Label>
            <Input value={form.username} disabled={!canWrite} onChange={(e) => set("username", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>密码</Label>
            <Input type="password" value={form.password} disabled={!canWrite} onChange={(e) => set("password", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>私钥</Label>
          <Textarea value={form.privateKey} disabled={!canWrite} rows={3} onChange={(e) => set("privateKey", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-2">
            <Label>Prometheus scope</Label>
            <Input value={form.prometheusScope} disabled={!canWrite} onChange={(e) => set("prometheusScope", e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>instance</Label>
            <Input value={form.instanceLabel} disabled={!canWrite} onChange={(e) => set("instanceLabel", e.target.value)} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>备注</Label>
          <Input value={form.notes} disabled={!canWrite} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={!canWrite || probing} onClick={() => onProbe(form)} title={probeEndpoint}>
            {probing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            探测
          </Button>
          <Button type="button" disabled={!canWrite || creating} onClick={() => onCreate(form)}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plug className="mr-2 h-4 w-4" />}
            保存
          </Button>
        </div>
      </div>
    </section>
  );
}
