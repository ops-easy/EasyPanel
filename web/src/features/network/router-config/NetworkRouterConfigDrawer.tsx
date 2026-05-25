import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Play, Settings2, ShieldCheck, SlidersHorizontal, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RawDataDisclosure } from "@/features/network/components/NetworkOpsPrimitives";
import type { NetworkDeviceKind } from "@/features/network/components/networkDeviceSingleton";
import type {
  NetworkApplyResult,
  NetworkChangePreview,
  NetworkChangeSet,
  NetworkConfigDomain,
  NetworkConfigSnapshot,
  NetworkDevice,
  NetworkResourceView,
  ProviderKey,
} from "@/features/network/model/networkTypes";
import { AdvancedProviderConfigForm, type AdvancedProviderConfigState } from "./AdvancedProviderConfigForm";
import { IkuaiStructuredConfigForm, type IkuaiStructuredState } from "./IkuaiStructuredConfigForm";
import { OpenWrtStructuredConfigForm, type OpenWrtStructuredState } from "./OpenWrtStructuredConfigForm";
import { RouterChangePreviewPanel } from "./RouterChangePreviewPanel";
import { RouterConfigDomainPicker } from "./RouterConfigDomainPicker";
import { RouterConfigSnapshotPanel } from "./RouterConfigSnapshotPanel";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

function domainFromView(view: NetworkResourceView): NetworkConfigDomain {
  if (view === "interfaces") return "interfaces";
  if (view === "clients") return "clients";
  if (view === "wireless") return "wireless";
  if (view === "connections") return "connections";
  if (view === "monitoring") return "monitoring";
  return "interfaces";
}

function providerOptions(provider: ProviderKey, devices: NetworkDevice[]): NetworkDeviceKind[] {
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

function ikuaiDefaultFuncName(domain: NetworkConfigDomain): string {
  if (domain === "clients") return "host_bind";
  if (domain === "dhcp") return "dhcp_server";
  if (domain === "connections") return "port_map";
  if (domain === "interfaces") return "wan";
  return "system";
}

export default function NetworkRouterConfigDrawer({
  view,
  provider,
  devices,
  canWrite,
  canViewRaw,
  triggerLabel = "路由器配置接管",
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName = "h-9 gap-2",
}: {
  view: NetworkResourceView;
  provider: ProviderKey;
  devices: NetworkDevice[];
  canWrite: boolean;
  canViewRaw: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
}) {
  const options = useMemo(() => providerOptions(provider, devices), [devices, provider]);
  const [open, setOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<NetworkDeviceKind>(() => options[0] ?? "openwrt");
  const [domain, setDomain] = useState<NetworkConfigDomain>(() => domainFromView(view));
  const [advancedMode, setAdvancedMode] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<NetworkChangePreview | undefined>();
  const [openWrtForm, setOpenWrtForm] = useState<OpenWrtStructuredState>({
    operation: "set",
    uciKey: "",
    value: "",
    reload: "none",
  });
  const [ikuaiForm, setIkuaiForm] = useState<IkuaiStructuredState>({
    operation: "set",
    funcName: "",
    action: "edit",
    paramText: "",
  });
  const [advancedForm, setAdvancedForm] = useState<AdvancedProviderConfigState>({
    uciKey: "",
    value: "",
    funcName: "",
    action: "edit",
    paramText: "",
  });

  useEffect(() => {
    if (options.length && !options.includes(selectedProvider)) {
      setSelectedProvider(options[0]);
    }
  }, [options, selectedProvider]);

  useEffect(() => {
    setDomain(domainFromView(view));
  }, [view]);

  useEffect(() => {
    setPreview(undefined);
    setConfirm(false);
  }, [domain, selectedProvider, advancedMode]);

  const selectedDevice = devices.find((device) => device.kind === selectedProvider);
  const deviceId = selectedDevice?.id ?? "";
  const disabled = !canWrite || !deviceId;

  const snapshotQ = useQuery({
    queryKey: ["network-config-snapshot", deviceId, selectedProvider, domain],
    queryFn: ({ signal }) =>
      apiGetJson<NetworkConfigSnapshot>(
        `/api/network/devices/${encodeURIComponent(deviceId)}/${selectedProvider}/config/${domain}`,
        { signal }
      ),
    enabled: open && Boolean(deviceId),
    staleTime: 15_000,
  });

  const buildChangeSet = (withConfirm: boolean): NetworkChangeSet => {
    if (selectedProvider === "openwrt") {
      const source = advancedMode ? advancedForm : { ...advancedForm, ...openWrtForm };
      return {
        domain,
        changes: [{ operation: openWrtForm.operation, section: source.uciKey.trim(), value: source.value }],
        reload: openWrtForm.reload,
        confirm: withConfirm,
      };
    }

    const source = advancedMode ? advancedForm : { ...advancedForm, ...ikuaiForm };
    const param = parseParam(source.paramText);
    return {
      domain,
      changes: [
        {
          operation: ikuaiForm.operation,
          funcName: (source.funcName || ikuaiDefaultFuncName(domain)).trim(),
          action: (source.action || ikuaiForm.operation).trim(),
          param,
        },
      ],
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

  const currentEndpoint = deviceId ? `/api/network/devices/${encodeURIComponent(deviceId)}/${selectedProvider}/config/${domain}` : "";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className={cn(triggerClassName)} disabled={options.length === 0}>
          <Settings2 className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto border-slate-200 bg-slate-50 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b border-slate-200 bg-white px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-slate-950">
            <Wand2 className="h-5 w-5 text-cyan-700" />
            路由器配置接管
          </SheetTitle>
          <SheetDescription>
            先生成预览，再确认应用；iKuai 走 HTTP Web/API，OpenWrt 走 SSH + ubus/UCI。
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-4 px-5 py-4">
          {!canWrite ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              当前账号只读，可以查看快照和预览状态，不能提交配置。
            </div>
          ) : null}

          <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>接管来源</Label>
                <Select value={selectedProvider} onValueChange={(value) => setSelectedProvider(value as NetworkDeviceKind)}>
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
                <Label>当前接口</Label>
                <div className="flex min-h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
                  {currentEndpoint || "请先在配置页接入 iKuai 或 OpenWrt"}
                </div>
              </div>
            </div>
            <RouterConfigDomainPicker value={domain} onChange={setDomain} />
          </section>

          <RouterConfigSnapshotPanel snapshot={snapshotQ.data} loading={snapshotQ.isFetching} />

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">配置内容</h3>
                <p className="mt-1 text-xs text-slate-500">默认使用结构化表单；不覆盖的厂商能力使用高级模式兜底。</p>
              </div>
              <Badge variant="outline" className="bg-slate-50 text-slate-600">
                {selectedProvider === "ikuai" ? "HTTP API" : "SSH/UCI"}
              </Badge>
            </div>

            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              <Checkbox checked={advancedMode} onCheckedChange={(value) => setAdvancedMode(value === true)} />
              <SlidersHorizontal className="h-4 w-4 text-slate-500" />
              高级模式
            </label>

            {advancedMode ? (
              <AdvancedProviderConfigForm provider={selectedProvider} value={advancedForm} disabled={disabled} onChange={setAdvancedForm} />
            ) : selectedProvider === "openwrt" ? (
              <OpenWrtStructuredConfigForm domain={domain} value={openWrtForm} disabled={disabled} onChange={setOpenWrtForm} />
            ) : (
              <IkuaiStructuredConfigForm domain={domain} value={ikuaiForm} disabled={disabled} onChange={setIkuaiForm} />
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
          </section>

          <RouterChangePreviewPanel preview={preview} />
          <RawDataDisclosure visible={canViewRaw} title="原始响应" value={{ snapshot: snapshotQ.data, preview, applyResult: apply.data }} />
        </div>

        <SheetFooter className="border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-xs leading-5 text-slate-500">写入类操作会经过后端权限校验；危险操作必须显式 confirm=true。</p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
