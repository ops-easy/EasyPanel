import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Cpu, HardDrive, Loader2, Monitor, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { apiDeleteJson, apiGetJson, apiPostJson, apiPutJson, wsUrlForApiPath } from "@/lib/api";
import { withPveMutationConfirm } from "@/features/compute/pve/lib/pveMutationConfirm";
import { ConfirmActionButton } from "@/shared/ui/confirm-action-button";
import VCenterSshTerminal from "@/features/vcenter/pages/VCenterSshTerminal";
import VCenterBastionSftpPanel from "@/features/vcenter/pages/VCenterBastionSftpPanel";

type PveDetailEnvelope = {
  target?: string;
  node?: string;
  type?: string;
  vmid?: string;
  status?: Record<string, unknown>;
  config?: Record<string, unknown>;
  warnings?: string[];
};

type PveMetricsEnvelope = { metrics?: unknown };
type PveSnapshotsEnvelope = { snapshots?: unknown };
type PveTaskEnvelope = { task?: unknown };
type PveConsoleEnvelope = { console?: Record<string, unknown> };
type NoVNCRFB = InstanceType<typeof import("@novnc/novnc").default>;
type PveConsoleQuality = "smooth" | "balanced" | "sharp";

const pveConsoleQualityProfiles: Record<PveConsoleQuality, { label: string; qualityLevel: number; compressionLevel: number; resizeSession: boolean }> = {
  smooth: { label: "流畅", qualityLevel: 3, compressionLevel: 2, resizeSession: true },
  balanced: { label: "均衡", qualityLevel: 5, compressionLevel: 2, resizeSession: true },
  sharp: { label: "清晰", qualityLevel: 7, compressionLevel: 1, resizeSession: false },
};
const PVE_POWER_ACTIONS = ["start", "shutdown", "reboot", "stop", "reset"];

function asRows(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === "object") {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

function valueText(v: unknown): string {
  if (v == null || v === "") return "-";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function optionalText(v: unknown): string | undefined {
  const s = valueText(v).trim();
  return s && s !== "-" ? s : undefined;
}

function numberText(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : "";
}

function fmtPercent(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
}

function fmtBytes(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(1)} TiB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GiB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MiB`;
  return `${(n / 1024).toFixed(1)} KiB`;
}

function normalizePveGuestType(guestType: string): string {
  switch (guestType.trim().toLowerCase()) {
    case "vm":
    case "qemu":
      return "qemu";
    case "ct":
    case "lxc":
      return "lxc";
    default:
      return guestType.trim().toLowerCase() || "qemu";
  }
}

function taskIdFromPayload(data: PveTaskEnvelope | undefined): string {
  const task = data?.task;
  if (typeof task === "string") return task;
  if (task && typeof task === "object") {
    const record = task as Record<string, unknown>;
    return String(record.upid ?? record.task ?? record.id ?? "").trim();
  }
  return "";
}

function taskDone(task: unknown): boolean {
  if (!task || typeof task !== "object") return false;
  const record = task as Record<string, unknown>;
  const status = String(record.status ?? "").toLowerCase();
  return status === "stopped" || record.exitstatus != null;
}

function taskFailed(task: unknown): boolean {
  if (!task || typeof task !== "object") return false;
  const exit = String((task as Record<string, unknown>).exitstatus ?? "").toUpperCase();
  return exit !== "" && exit !== "OK";
}

function KeyValueTable({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, v]) => v != null && v !== "");
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">{title}</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow>
                <TableCell className="py-8 text-center text-sm text-slate-500">暂无数据</TableCell>
              </TableRow>
            ) : (
              entries.map(([k, v]) => (
                <TableRow key={k}>
                  <TableCell className="w-52 font-mono text-xs text-slate-500">{k}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-900">{valueText(v)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function MetricsTable({ rows }: { rows: Record<string, unknown>[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-950">最近性能</h2>
      <div className="overflow-auto rounded-lg border border-slate-100">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>CPU</TableHead>
              <TableHead>内存</TableHead>
              <TableHead>磁盘读</TableHead>
              <TableHead>磁盘写</TableHead>
              <TableHead>网络入</TableHead>
              <TableHead>网络出</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">暂无性能数据</TableCell>
              </TableRow>
            ) : (
              rows.slice(-24).map((row, idx) => (
                <TableRow key={`${valueText(row.time)}-${idx}`}>
                  <TableCell className="font-mono text-xs">{valueText(row.time)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtPercent(row.cpu)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtBytes(row.mem)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtBytes(row.diskread)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtBytes(row.diskwrite)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtBytes(row.netin)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtBytes(row.netout)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveGuestHardwareDialog({
  open,
  onOpenChange,
  config,
  pending,
  onSaveConfig,
  onResizeDisk,
  confirmTarget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: Record<string, unknown>;
  pending: boolean;
  onSaveConfig: (body: Record<string, number | boolean>) => void;
  onResizeDisk: (body: { disk: string; size: string; confirm: boolean }) => void;
  confirmTarget: string;
}) {
  const [cores, setCores] = useState("");
  const [memory, setMemory] = useState("");
  const [disk, setDisk] = useState("");
  const [size, setSize] = useState("");
  const [mutationConfirmName, setMutationConfirmName] = useState("");
  const mutationConfirmed = mutationConfirmName.trim() === confirmTarget;

  useEffect(() => {
    if (!open) return;
    setCores(numberText(config.cores ?? config.cpu));
    setMemory(numberText(config.memory));
  }, [config, open]);

  const saveConfig = () => {
    const body: Record<string, number> = {};
    const c = Number(cores);
    const m = Number(memory);
    if (Number.isFinite(c) && c > 0) body.cores = c;
    if (Number.isFinite(m) && m > 0) body.memory = m;
    if (Object.keys(body).length === 0) {
      toast.error("请填写 CPU 或内存");
      return;
    }
    onSaveConfig({ ...body, confirm: mutationConfirmed });
  };

  const resize = () => {
    if (!disk.trim() || !size.trim()) {
      toast.error("请填写磁盘和目标大小");
      return;
    }
    onResizeDisk({ disk: disk.trim(), size: size.trim(), confirm: mutationConfirmed });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>编辑 PVE Guest 硬件</DialogTitle>
          <DialogDescription>保存后由 PVE 返回异步任务，平台会持续轮询任务状态。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_1fr] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="pve-mutation-confirm">确认目标</Label>
            <Input
              id="pve-mutation-confirm"
              className="font-mono"
              value={mutationConfirmName}
              onChange={(e) => setMutationConfirmName(e.target.value)}
              placeholder={confirmTarget}
              disabled={pending}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">
            输入 <span className="font-mono text-slate-800">{confirmTarget}</span> 后保存硬件或扩容磁盘。
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-950">CPU / 内存</h3>
            <div className="space-y-1.5">
              <Label>CPU cores</Label>
              <Input className="font-mono" inputMode="numeric" value={cores} onChange={(e) => setCores(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>内存 MB</Label>
              <Input className="font-mono" inputMode="numeric" value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>
            <Button type="button" className="w-full gap-2" onClick={saveConfig} disabled={pending || !mutationConfirmed}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存配置
            </Button>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-950">磁盘扩容</h3>
            <div className="space-y-1.5">
              <Label>磁盘 ID</Label>
              <Input className="font-mono" placeholder="scsi0 / virtio0 / rootfs" value={disk} onChange={(e) => setDisk(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>目标大小</Label>
              <Input className="font-mono" placeholder="+10G 或 80G" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <Button type="button" variant="outline" className="w-full gap-2" onClick={resize} disabled={pending || !mutationConfirmed}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
              提交扩容
            </Button>
          </section>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PveSnapshotsPanel({
  rows,
  loading,
  pending,
  onCreate,
  onDelete,
}: {
  rows: Record<string, unknown>[];
  loading: boolean;
  pending: boolean;
  onCreate: (body: { snapname: string; description?: string; vmstate?: boolean; confirm: boolean }) => void;
  onDelete: (snapname: string, confirm: boolean) => void;
}) {
  const [snapname, setSnapname] = useState("");
  const [description, setDescription] = useState("");
  const [vmstate, setVmstate] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const create = () => {
    if (!snapname.trim()) {
      toast.error("请填写快照名称");
      return;
    }
    onCreate({ snapname: snapname.trim(), description: description.trim() || undefined, vmstate, confirm: true });
    setSnapname("");
    setDescription("");
    setVmstate(false);
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-950">创建快照</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div className="space-y-1.5">
            <Label>名称</Label>
            <Input className="font-mono" value={snapname} onChange={(e) => setSnapname(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>描述</Label>
            <Textarea className="min-h-10" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <Switch checked={vmstate} onCheckedChange={setVmstate} />
            <span>保存内存</span>
          </div>
        </div>
        <ConfirmActionButton
          type="button"
          className="mt-3 gap-2"
          disabled={pending}
          title="确认创建 PVE 快照？"
          description={`将为当前虚拟机创建快照「${snapname.trim() || "未命名"}」。`}
          confirmLabel="创建"
          onConfirm={create}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          创建快照
        </ConfirmActionButton>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-100 p-4 md:grid-cols-[minmax(0,280px)_1fr] md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="pve-snapshot-delete-confirm">删除确认</Label>
            <Input
              id="pve-snapshot-delete-confirm"
              className="font-mono"
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder="输入快照名称"
              disabled={pending}
            />
          </div>
          <p className="text-xs leading-5 text-slate-500">输入快照名称后启用对应删除按钮。</p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>描述</TableHead>
              <TableHead>时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">加载中...</TableCell></TableRow>
            ) : null}
            {!loading && rows.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-slate-500">暂无快照</TableCell></TableRow>
            ) : null}
            {!loading ? rows.map((row) => {
              const name = String(row.name ?? row.snapname ?? "").trim();
              const deleteConfirmed = deleteConfirmName.trim() === name;
              return (
                <TableRow key={name || valueText(row.snaptime)}>
                  <TableCell className="font-mono text-xs">{name || "-"}</TableCell>
                  <TableCell className="max-w-xl truncate text-sm">{valueText(row.description)}</TableCell>
                  <TableCell className="font-mono text-xs">{valueText(row.snaptime)}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-red-700" disabled={!name || pending || !deleteConfirmed} onClick={() => { onDelete(name, true); setDeleteConfirmName(""); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              );
            }) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function PveConsolePanel({
  targetId,
  node,
  guestType,
  vmid,
}: {
  targetId: string;
  node: string;
  guestType: string;
  vmid: string;
}) {
  const [consoleData, setConsoleData] = useState<Record<string, unknown> | null>(null);
  const [viewerStatus, setViewerStatus] = useState("未连接");
  const [viewerError, setViewerError] = useState("");
  const [viewOnly, setViewOnly] = useState(false);
  const [quality, setQuality] = useState<PveConsoleQuality>("smooth");
  const screenRef = useRef<HTMLDivElement | null>(null);
  const rfbRef = useRef<NoVNCRFB | null>(null);
  const viewOnlyRef = useRef(viewOnly);
  const qualityRef = useRef(quality);

  const ticketMut = useMutation({
    mutationFn: () =>
      apiPostJson<PveConsoleEnvelope>(
        `/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/console/ticket`,
        { node, type: guestType }
      ),
    onSuccess: (data) => {
      setConsoleData(data.console ?? null);
      toast.success("PVE 控制台 ticket 已生成");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const port = String(consoleData?.port ?? "").trim();
  const ticket = String(consoleData?.ticket ?? "").trim();
  const proxyWsUrl = port && ticket
    ? wsUrlForApiPath(`/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/console/ws?node=${encodeURIComponent(node)}&type=${encodeURIComponent(guestType)}&port=${encodeURIComponent(port)}&vncticket=${encodeURIComponent(ticket)}`)
    : "";

  useEffect(() => {
    if (!proxyWsUrl || !screenRef.current) return;
    let cancelled = false;
    let rfb: NoVNCRFB | null = null;
    const target = screenRef.current;
    target.innerHTML = "";
    setViewerError("");
    setViewerStatus("连接中");

    void import("@novnc/novnc")
      .then(({ default: RFB }) => {
        if (cancelled) return;
        rfb = new RFB(target, proxyWsUrl, {
          shared: true,
          credentials: ticket ? { password: ticket } : undefined,
        });
        const profile = pveConsoleQualityProfiles[qualityRef.current];
        rfbRef.current = rfb;
        rfb.qualityLevel = profile.qualityLevel;
        rfb.compressionLevel = profile.compressionLevel;
        rfb.scaleViewport = true;
        rfb.resizeSession = profile.resizeSession;
        rfb.clipViewport = false;
        rfb.dragViewport = false;
        rfb.focusOnClick = true;
        rfb.viewOnly = viewOnlyRef.current;
        rfb.addEventListener("connect", () => {
          setViewerStatus("已连接");
          setViewerError("");
          rfb?.focus();
        });
        rfb.addEventListener("disconnect", (event) => {
          const clean = Boolean((event as CustomEvent<{ clean?: boolean }>).detail?.clean);
          setViewerStatus(clean ? "已断开" : "连接中断");
          if (!clean) setViewerError("PVE 控制台连接中断，请重新生成控制台 ticket 后再试。");
        });
        rfb.addEventListener("credentialsrequired", () => {
          if (ticket) rfb?.sendCredentials({ password: ticket });
        });
        rfb.addEventListener("securityfailure", (event) => {
          const detail = (event as CustomEvent<{ reason?: string; status?: number }>).detail;
          setViewerError(detail?.reason || `PVE VNC 安全协商失败${detail?.status != null ? `（${detail.status}）` : ""}`);
        });
      })
      .catch((err) => {
        setViewerStatus("加载失败");
        setViewerError((err as Error).message);
      });

    return () => {
      cancelled = true;
      if (rfb) rfb.disconnect();
      if (rfbRef.current === rfb) rfbRef.current = null;
      target.innerHTML = "";
    };
  }, [proxyWsUrl, ticket]);

  useEffect(() => {
    viewOnlyRef.current = viewOnly;
    if (rfbRef.current) rfbRef.current.viewOnly = viewOnly;
  }, [viewOnly]);

  useEffect(() => {
    qualityRef.current = quality;
    const rfb = rfbRef.current;
    if (!rfb) return;
    const profile = pveConsoleQualityProfiles[quality];
    rfb.qualityLevel = profile.qualityLevel;
    rfb.compressionLevel = profile.compressionLevel;
    rfb.resizeSession = profile.resizeSession;
  }, [quality]);

  const disconnectViewer = () => {
    if (!rfbRef.current) return;
    rfbRef.current.disconnect();
    rfbRef.current = null;
    setViewerStatus("已断开");
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">PVE 控制台</h2>
          <p className="mt-1 text-sm text-slate-600">平台后端会使用已保存凭据生成 VNC ticket，并在页面内嵌 noVNC 控制台。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={() => ticketMut.mutate()} disabled={ticketMut.isPending}>
            {ticketMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
            生成控制台
          </Button>
          <Button type="button" variant="outline" disabled={!rfbRef.current} onClick={() => rfbRef.current?.sendCtrlAltDel()}>
            Ctrl Alt Del
          </Button>
          <Button type="button" variant="outline" disabled={!rfbRef.current} onClick={disconnectViewer}>
            断开
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge variant={viewerStatus === "已连接" ? "default" : "outline"}>{viewerStatus}</Badge>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
          <Switch checked={viewOnly} onCheckedChange={setViewOnly} />
          <span>只读</span>
        </label>
        <Select value={quality} onValueChange={(v) => setQuality(v as PveConsoleQuality)}>
          <SelectTrigger className="h-9 w-[112px] bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(pveConsoleQualityProfiles).map(([key, profile]) => (
              <SelectItem key={key} value={key}>
                {profile.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {proxyWsUrl ? <Button type="button" variant="ghost" size="sm" onClick={() => copy(proxyWsUrl)}>复制代理地址</Button> : null}
      </div>
      {viewerError ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{viewerError}</div> : null}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-900 bg-slate-950">
        <div ref={screenRef} className="h-[min(70vh,620px)] min-h-[420px] w-full [&>canvas]:m-auto [&>canvas]:block" />
      </div>
      {proxyWsUrl ? (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">同源 WebSocket</p>
            <code className="mt-1 block break-all text-xs text-slate-900">{proxyWsUrl}</code>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">尚未生成控制台 ticket。</p>
      )}
    </section>
  );
}

export default function PveGuestDetail() {
  const { targetId = "", node = "", guestType = "qemu", vmid = "" } = useParams();
  const [searchParams] = useSearchParams();
  const canonicalGuestType = normalizePveGuestType(guestType);
  const queryClient = useQueryClient();
  const requestedTab = searchParams.get("tab");
  const initialTab =
    requestedTab === "metrics" ||
    requestedTab === "hardware" ||
    requestedTab === "snapshots" ||
    requestedTab === "console" ||
    requestedTab === "ssh" ||
    requestedTab === "sftp"
      ? requestedTab
      : "overview";
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const [taskId, setTaskId] = useState("");
  const bastionTargetId = `pve:${targetId}:${node}:${canonicalGuestType}:${vmid}`;
  const sftpTarget = useMemo(() => ({ kind: "target" as const, targetId: bastionTargetId }), [bastionTargetId]);
  const querySuffix = `node=${encodeURIComponent(node)}&type=${encodeURIComponent(canonicalGuestType)}`;
  const detailPath = `/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}?${querySuffix}`;
  const metricsPath = `/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/metrics?${querySuffix}&timeframe=hour`;
  const snapshotsPath = `/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/snapshots?${querySuffix}`;

  const detailQ = useQuery({
    queryKey: ["pve-guest-detail", targetId, node, canonicalGuestType, vmid],
    queryFn: ({ signal }) => apiGetJson<PveDetailEnvelope>(detailPath, { signal }),
    enabled: Boolean(targetId && node && canonicalGuestType && vmid),
    refetchInterval: 30_000,
  });

  const metricsQ = useQuery({
    queryKey: ["pve-guest-metrics", targetId, node, canonicalGuestType, vmid],
    queryFn: ({ signal }) => apiGetJson<PveMetricsEnvelope>(metricsPath, { signal }),
    enabled: Boolean(targetId && node && canonicalGuestType && vmid),
    refetchInterval: 30_000,
  });

  const snapshotsQ = useQuery({
    queryKey: ["pve-guest-snapshots", targetId, node, canonicalGuestType, vmid],
    queryFn: ({ signal }) => apiGetJson<PveSnapshotsEnvelope>(snapshotsPath, { signal }),
    enabled: Boolean(targetId && node && canonicalGuestType && vmid),
    refetchInterval: 30_000,
  });

  const taskQ = useQuery({
    queryKey: ["pve-task-status", targetId, taskId],
    queryFn: ({ signal }) =>
      apiGetJson<PveTaskEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/tasks/${encodeURIComponent(taskId)}/status`, { signal }),
    enabled: Boolean(targetId && taskId),
    refetchInterval: (q) => taskDone(q.state.data?.task) ? false : 1200,
  });

  const invalidateGuest = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["pve-guest-detail", targetId, node, canonicalGuestType, vmid] });
    void queryClient.invalidateQueries({ queryKey: ["pve-guest-snapshots", targetId, node, canonicalGuestType, vmid] });
    void queryClient.invalidateQueries({ queryKey: ["pve-guests", targetId] });
    void queryClient.invalidateQueries({ queryKey: ["pve-tasks", targetId] });
  }, [canonicalGuestType, node, queryClient, targetId, vmid]);

  useEffect(() => {
    if (!taskId || !taskDone(taskQ.data?.task)) return;
    if (taskFailed(taskQ.data?.task)) toast.error(`PVE 任务失败：${valueText((taskQ.data?.task as Record<string, unknown>)?.exitstatus)}`);
    else toast.success("PVE 任务已完成");
    setTaskId("");
    invalidateGuest();
  }, [taskId, taskQ.data?.task, invalidateGuest]);

  const submitTask = (data: PveTaskEnvelope, fallbackMessage: string) => {
    const id = taskIdFromPayload(data);
    if (id) {
      setTaskId(id);
      toast.message("PVE 任务已提交", { description: id });
    } else {
      toast.success(fallbackMessage);
      invalidateGuest();
    }
  };

  const configMut = useMutation({
    mutationFn: (body: Record<string, number | boolean>) => apiPutJson<PveTaskEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/config?${querySuffix}`, body),
    onSuccess: (data) => {
      setHardwareOpen(false);
      submitTask(data, "配置已保存");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const diskMut = useMutation({
    mutationFn: (body: { disk: string; size: string; confirm: boolean }) =>
      apiPostJson<PveTaskEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/disks/resize`, { ...body, node, type: canonicalGuestType }),
    onSuccess: (data) => submitTask(data, "磁盘扩容已提交"),
    onError: (e) => toast.error((e as Error).message),
  });

  const powerMut = useMutation({
    mutationFn: (action: string) =>
      apiPostJson<PveTaskEnvelope>(
        `/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/power`,
        withPveMutationConfirm({ node, type: canonicalGuestType, action })
      ),
    onSuccess: (data) => {
      submitTask(data, "电源操作已提交");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const snapshotCreateMut = useMutation({
    mutationFn: (body: { snapname: string; description?: string; vmstate?: boolean; confirm: boolean }) =>
      apiPostJson<PveTaskEnvelope>(snapshotsPath, withPveMutationConfirm(body)),
    onSuccess: (data) => submitTask(data, "快照任务已提交"),
    onError: (e) => toast.error((e as Error).message),
  });

  const snapshotDeleteMut = useMutation({
    mutationFn: ({ snapname, confirm }: { snapname: string; confirm: boolean }) =>
      apiDeleteJson<PveTaskEnvelope>(`/api/pve/targets/${encodeURIComponent(targetId)}/guests/${encodeURIComponent(vmid)}/snapshots/${encodeURIComponent(snapname)}?${querySuffix}&confirm=${confirm ? "true" : "false"}`),
    onSuccess: (data) => submitTask(data, "快照删除已提交"),
    onError: (e) => toast.error((e as Error).message),
  });

  const status = detailQ.data?.status ?? {};
  const config = detailQ.data?.config ?? {};
  const metricRows = useMemo(() => asRows(metricsQ.data?.metrics), [metricsQ.data?.metrics]);
  const snapshotRows = useMemo(() => asRows(snapshotsQ.data?.snapshots), [snapshotsQ.data?.snapshots]);
  const loading = detailQ.isLoading || metricsQ.isLoading;
  const guestIpHint = optionalText(status.ip ?? status.ip_address ?? status.ipAddress ?? config.ipconfig0);
  const mutationConfirmTarget = String(config.name ?? status.name ?? vmid).trim() || vmid;
  const operationPending = configMut.isPending || diskMut.isPending || powerMut.isPending || snapshotCreateMut.isPending || snapshotDeleteMut.isPending || Boolean(taskId);

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link to="/cluster/compute/pve/guests" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-amber-700">
              <ArrowLeft className="h-3.5 w-3.5" />
              返回 PVE 虚拟机 / CT
            </Link>
            <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-slate-950">
              <Cpu className="h-6 w-6 text-amber-600" />
              {valueText(config.name ?? status.name ?? vmid)}
            </h1>
            <p className="mt-2 font-mono text-sm text-slate-500">{targetId} · {node} · {canonicalGuestType} · {vmid}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => { void detailQ.refetch(); void metricsQ.refetch(); void snapshotsQ.refetch(); }} disabled={detailQ.isFetching || metricsQ.isFetching || snapshotsQ.isFetching}>
              {detailQ.isFetching || metricsQ.isFetching || snapshotsQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
            <Button className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={() => setHardwareOpen(true)}>
              <HardDrive className="h-4 w-4" />
              硬件
            </Button>
          </div>
        </div>
      </section>

      {detailQ.error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{String(detailQ.error)}</div> : null}
      {detailQ.data?.warnings?.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{detailQ.data.warnings.join("；")}</div>
      ) : null}
      {taskId ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          正在跟踪 PVE 任务：<span className="font-mono text-xs">{taskId}</span>
        </div>
      ) : null}

      <Tabs defaultValue={initialTab} className="w-full space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="metrics">性能</TabsTrigger>
          <TabsTrigger value="hardware">硬件</TabsTrigger>
          <TabsTrigger value="snapshots">快照</TabsTrigger>
          <TabsTrigger value="console">控制台</TabsTrigger>
          <TabsTrigger value="ssh">SSH 终端</TabsTrigger>
          <TabsTrigger value="sftp">SFTP 文件</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">状态</p>
              <div className="mt-2"><Badge>{valueText(status.status)}</Badge></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">CPU</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{fmtPercent(status.cpu)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">内存</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{fmtBytes(status.mem)} / {fmtBytes(status.maxmem)}</p>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">电源操作</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {PVE_POWER_ACTIONS.map((action) => (
                <ConfirmActionButton
                  key={action}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={operationPending}
                  title="确认执行 PVE 电源操作？"
                  description={`将对 ${canonicalGuestType} ${node}/${vmid} 执行 ${action} 操作。`}
                  confirmLabel="执行"
                  onConfirm={() => powerMut.mutate(action)}
                >
                  {action}
                </ConfirmActionButton>
              ))}
            </div>
          </section>
          {loading ? <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />加载中...</div> : null}
          <section className="grid gap-4 xl:grid-cols-2">
            <KeyValueTable title="运行状态" data={status} />
            <KeyValueTable title="配置" data={config} />
          </section>
        </TabsContent>

        <TabsContent value="metrics">
          <MetricsTable rows={metricRows} />
        </TabsContent>

        <TabsContent value="hardware" className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">硬件配置</h2>
                <p className="mt-1 text-sm text-slate-600">CPU、内存与磁盘扩容由平台直接调用 PVE API。</p>
              </div>
              <Button className="gap-2 bg-amber-600 hover:bg-amber-700" onClick={() => setHardwareOpen(true)}>
                <HardDrive className="h-4 w-4" />
                编辑硬件
              </Button>
            </div>
          </section>
          <KeyValueTable title="当前配置" data={config} />
        </TabsContent>

        <TabsContent value="snapshots">
          <PveSnapshotsPanel
            rows={snapshotRows}
            loading={snapshotsQ.isLoading}
            pending={operationPending}
            onCreate={(body) => snapshotCreateMut.mutate(body)}
            onDelete={(snapname, confirm) => snapshotDeleteMut.mutate({ snapname, confirm })}
          />
        </TabsContent>

        <TabsContent value="console">
          <PveConsolePanel targetId={targetId} node={node} guestType={canonicalGuestType} vmid={vmid} />
        </TabsContent>

        <TabsContent value="ssh" className="space-y-4">
          <VCenterSshTerminal
            targetId={bastionTargetId}
            guestIpHint={guestIpHint ?? node}
            sshSettingsPath="/cluster/compute/bastion"
            sshSettingsLabel="堡垒机"
            targetIpSourceLabel="PVE Guest Agent 或目标覆盖地址"
            targetIpMissingHint="（可在堡垒机目标中配置 SSH Host 覆盖）"
          />
        </TabsContent>

        <TabsContent value="sftp">
          <div className="h-[560px] min-h-[420px]">
            <VCenterBastionSftpPanel target={sftpTarget} />
          </div>
        </TabsContent>
      </Tabs>

      <PveGuestHardwareDialog
        open={hardwareOpen}
        onOpenChange={setHardwareOpen}
        config={config}
        pending={operationPending}
        onSaveConfig={(body) => configMut.mutate(body)}
        onResizeDisk={(body) => diskMut.mutate(body)}
        confirmTarget={mutationConfirmTarget}
      />
    </div>
  );
}
