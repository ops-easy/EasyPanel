import React, { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Play, Settings2, ShieldCheck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import { Textarea } from "@/shared/ui/textarea";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RawDataDisclosure } from "@/features/network/components/NetworkOpsPrimitives";
import type { NetworkDeviceKind, SingletonNetworkDevice } from "@/features/network/components/networkDeviceSingleton";
import type { NetworkResourceView } from "@/features/network/pages/NetworkResourcePage";

type NetworkDevice = SingletonNetworkDevice & {
  apiUrl?: string;
  host?: string;
  port?: number;
  authType?: string;
  username?: string;
  passwordSet?: boolean;
  privateKeySet?: boolean;
};

export type NetworkConfigDomain =
  | "system"
  | "interfaces"
  | "clients"
  | "wireless"
  | "connections"
  | "monitoring"
  | "dhcp"
  | "dns"
  | "services";

export type NetworkConfigSnapshot = {
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  source?: string;
  capability?: string;
  checkedAt?: string;
  sections?: unknown[];
  errors?: string[];
  raw?: unknown;
};

export type NetworkChangeSet = {
  domain: NetworkConfigDomain;
  changes: Array<{
    operation: string;
    target?: string;
    section?: string;
    value?: string;
    funcName?: string;
    action?: string;
    param?: Record<string, unknown>;
  }>;
  reload?: string;
  confirm?: boolean;
};

export type NetworkChangePreview = {
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  capability?: string;
  commands?: string[];
  requests?: Array<{ func_name?: string; action?: string; param?: Record<string, unknown> }>;
  warnings?: string[];
  unsupported?: string[];
  requiresConfirmation?: boolean;
  raw?: unknown;
};

export type NetworkApplyResult = {
  ok?: boolean;
  provider?: NetworkDeviceKind;
  domain?: NetworkConfigDomain | string;
  result?: unknown;
  results?: unknown[];
  preview?: NetworkChangePreview;
  checkedAt?: string;
};

type ProviderKey = "ikuai" | "openwrt";

const domainItems: Array<{ value: NetworkConfigDomain; label: string }> = [
  { value: "interfaces", label: "接口 / WAN / LAN" },
  { value: "clients", label: "终端备注 / 限速" },
  { value: "dhcp", label: "DHCP / 静态租约" },
  { value: "wireless", label: "无线" },
  { value: "dns", label: "DNS / dnsmasq" },
  { value: "connections", label: "防火墙 / NAT" },
  { value: "services", label: "服务操作" },
  { value: "monitoring", label: "监控采集" },
];

const operationItems = [
  { value: "set", label: "设置 / 编辑" },
  { value: "delete", label: "删除" },
];

const reloadItems = [
  { value: "none", label: "不重载" },
  { value: "network", label: "重载 network" },
  { value: "wifi", label: "重载 Wi-Fi" },
  { value: "dnsmasq", label: "重启 dnsmasq" },
  { value: "firewall", label: "重载 firewall" },
];

function domainFromView(view: NetworkResourceView): NetworkConfigDomain {
  if (view === "interfaces") return "interfaces";
  if (view === "clients") return "clients";
  if (view === "wireless") return "wireless";
  if (view === "connections") return "connections";
  if (view === "monitoring") return "monitoring";
  return "interfaces";
}

function providerOptions(provider: "all" | ProviderKey, devices: NetworkDevice[]): ProviderKey[] {
  const hasIkuai = devices.some((device) => device.kind === "ikuai");
  const hasOpenWrt = devices.some((device) => device.kind === "openwrt");
  if (provider === "ikuai") return hasIkuai ? ["ikuai"] : [];
  if (provider === "openwrt") return hasOpenWrt ? ["openwrt"] : [];
  return [
    ...(hasIkuai ? (["ikuai"] as const) : []),
    ...(hasOpenWrt ? (["openwrt"] as const) : []),
  ];
}

function parseParam(text: string): Record<string, unknown> | undefined {
  const raw = text.trim();
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { value: parsed };
  } catch {
    return { value: raw };
  }
}

function endpointFor(deviceId: string, provider: ProviderKey, domain: NetworkConfigDomain): string {
  return `/api/network/devices/${encodeURIComponent(deviceId)}/${provider}/config/${domain}`;
}

function RequestsPreview({ preview }: { preview?: NetworkChangePreview }) {
  if (!preview) return null;
  const commands = preview.commands ?? [];
  const requests = preview.requests ?? [];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-950">变更预览</p>
        <Badge variant="outline" className="bg-white text-slate-600">
          {preview.capability || "dry-run"}
        </Badge>
      </div>
      {commands.length ? (
        <div className="mt-3 space-y-2">
          {commands.map((command, index) => (
            <code key={`${command}:${index}`} className="block rounded-md bg-white px-3 py-2 text-xs text-slate-700">
              {command}
            </code>
          ))}
        </div>
      ) : null}
      {requests.length ? (
        <div className="mt-3 grid gap-2">
          {requests.map((request, index) => (
            <div key={`${request.func_name}:${request.action}:${index}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
              <span className="font-medium text-slate-900">{request.func_name}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-600">{request.action}</span>
            </div>
          ))}
        </div>
      ) : null}
      {preview.warnings?.length ? (
        <p className="mt-3 text-xs leading-5 text-amber-700">{preview.warnings.join("；")}</p>
      ) : null}
    </div>
  );
}

export default function NetworkConfigEditor({
  view,
  provider,
  devices,
  canWrite,
  canViewRaw,
}: {
  view: NetworkResourceView;
  provider: "all" | ProviderKey;
  devices: NetworkDevice[];
  canWrite: boolean;
  canViewRaw: boolean;
}) {
  const options = useMemo(() => providerOptions(provider, devices), [devices, provider]);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>(() => options[0] ?? "openwrt");
  const [domain, setDomain] = useState<NetworkConfigDomain>(() => domainFromView(view));
  const [operation, setOperation] = useState("set");
  const [uciKey, setUciKey] = useState("");
  const [value, setValue] = useState("");
  const [reload, setReload] = useState("none");
  const [funcName, setFuncName] = useState("");
  const [action, setAction] = useState("edit");
  const [paramText, setParamText] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<NetworkChangePreview | undefined>();
  const selectedDevice = devices.find((device) => device.kind === selectedProvider);
  const deviceId = selectedDevice?.id ?? "";

  React.useEffect(() => {
    if (options.length && !options.includes(selectedProvider)) {
      setSelectedProvider(options[0]);
    }
  }, [options, selectedProvider]);

  React.useEffect(() => {
    setDomain(domainFromView(view));
  }, [view]);

  const snapshotQ = useQuery({
    queryKey: ["network-config-snapshot", deviceId, selectedProvider, domain],
    queryFn: ({ signal }) => apiGetJson<NetworkConfigSnapshot>(`/api/network/devices/${encodeURIComponent(deviceId)}/${selectedProvider}/config/${domain}`, { signal }),
    enabled: open && Boolean(deviceId),
    staleTime: 15_000,
  });

  const buildChangeSet = (withConfirm: boolean): NetworkChangeSet => {
    const param = parseParam(paramText);
    return selectedProvider === "openwrt"
      ? {
          domain,
          changes: [{ operation, section: uciKey.trim(), value }],
          reload,
          confirm: withConfirm,
        }
      : {
          domain,
          changes: [
            {
              operation,
              funcName: funcName.trim(),
              action: action.trim() || operation,
              param,
              value: param ? undefined : value,
            },
          ],
          reload,
          confirm: withConfirm,
        };
  };

  const dryRun = useMutation({
    mutationFn: () =>
      apiPostJson<NetworkChangePreview>(
        `/api/network/devices/${encodeURIComponent(deviceId)}/${selectedProvider}/config/${domain}/dry-run`,
        buildChangeSet(false)
      ),
    onSuccess: (data) => {
      setPreview(data);
      toast.success("变更预览已生成");
    },
    onError: (error) => toast.error(String(error)),
  });

  const apply = useMutation({
    mutationFn: () =>
      apiPostJson<NetworkApplyResult>(
        `/api/network/devices/${encodeURIComponent(deviceId)}/${selectedProvider}/config/${domain}/apply`,
        buildChangeSet(confirm)
      ),
    onSuccess: (data) => {
      setPreview(data.preview ?? preview);
      toast.success("配置已提交");
      void snapshotQ.refetch();
    },
    onError: (error) => toast.error(String(error)),
  });

  const disabled = !canWrite || !deviceId;
  const currentEndpoint = deviceId ? endpointFor(deviceId, selectedProvider, domain) : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 gap-2" disabled={options.length === 0}>
          <Settings2 className="h-4 w-4" />
          配置变更
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-slate-200 bg-slate-50 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-slate-950">
            <Wand2 className="h-5 w-5 text-cyan-700" />
            网络配置接管
          </SheetTitle>
          <SheetDescription>先 dry-run 预览变更，再确认应用；iKuai 走 HTTP API，OpenWrt 走 SSH/UCI。</SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-5 py-4">
          {!canWrite ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              当前账号只读，可以查看快照和预览状态，不能提交配置。
            </div>
          ) : null}
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>来源</Label>
                <Select value={selectedProvider} onValueChange={(value) => setSelectedProvider(value as ProviderKey)}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item === "ikuai" ? "iKuai" : "OpenWrt"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>配置域</Label>
                <Select value={domain} onValueChange={(value) => setDomain(value as NetworkConfigDomain)}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {domainItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {currentEndpoint || "请先在配置页接入 iKuai 或 OpenWrt。"}
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">当前快照</p>
                <p className="mt-1 text-xs text-slate-500">
                  {snapshotQ.data?.capability || (snapshotQ.isLoading ? "读取中" : "等待读取")}
                </p>
              </div>
              {snapshotQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
            </div>
            {snapshotQ.data?.errors?.length ? (
              <p className="text-xs leading-5 text-amber-700">{snapshotQ.data.errors.join("；")}</p>
            ) : (
              <p className="text-xs leading-5 text-slate-500">
                {snapshotQ.data?.sections?.length ? `${snapshotQ.data.sections.length} 条配置项可用于核对。` : "暂无结构化配置项。"}
              </p>
            )}
          </div>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>操作</Label>
                <Select value={operation} onValueChange={setOperation}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operationItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>应用后动作</Label>
                <Select value={reload} onValueChange={setReload}>
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reloadItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedProvider === "openwrt" ? (
              <>
                <div className="grid gap-2">
                  <Label>UCI 配置项</Label>
                  <Input
                    value={uciKey}
                    onChange={(event) => setUciKey(event.target.value)}
                    placeholder="network.lan.ipaddr"
                    className="font-mono text-sm"
                    disabled={disabled}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>值</Label>
                  <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="192.168.2.1" disabled={disabled || operation === "delete"} />
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>iKuai func_name</Label>
                    <Input value={funcName} onChange={(event) => setFuncName(event.target.value)} placeholder="wan / dhcp_server / portmap" disabled={disabled} />
                  </div>
                  <div className="grid gap-2">
                    <Label>iKuai action</Label>
                    <Input value={action} onChange={(event) => setAction(event.target.value)} placeholder="show / edit / add / del" disabled={disabled} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>参数</Label>
                  <Textarea
                    value={paramText}
                    onChange={(event) => setParamText(event.target.value)}
                    placeholder='{"id":1,"comment":"office"}'
                    className="min-h-24 font-mono text-sm"
                    disabled={disabled}
                  />
                </div>
              </>
            )}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="gap-2" disabled={disabled || dryRun.isPending} onClick={() => dryRun.mutate()}>
                {dryRun.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                生成预览
              </Button>
              <label className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-600">
                <Checkbox checked={confirm} onCheckedChange={(value) => setConfirm(value === true)} disabled={disabled} />
                confirm=true
              </label>
              <Button
                type="button"
                className={cn("gap-2 bg-cyan-700 hover:bg-cyan-800", !confirm && "opacity-80")}
                disabled={disabled || apply.isPending || !preview || !confirm}
                onClick={() => apply.mutate()}
              >
                {apply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                确认应用
              </Button>
            </div>
          </div>

          <RequestsPreview preview={preview} />
          <RawDataDisclosure
            visible={canViewRaw}
            title="原始响应"
            value={{
              snapshot: snapshotQ.data,
              preview,
              applyResult: apply.data,
            }}
          />
        </div>

        <SheetFooter className="border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-xs leading-5 text-slate-500">
            写入类操作会经过后端权限校验；危险操作必须显式 confirm=true。
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
