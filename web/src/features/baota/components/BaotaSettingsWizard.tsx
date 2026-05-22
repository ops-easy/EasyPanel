import React, { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { YamlEditor } from "@/shared/ui/YamlEditor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/collapsible";
import type { RuntimeSettingsDTO } from "@/lib/api";
import { cn } from "@/lib/utils";

type BaotaSettingsWizardProps = {
  form: RuntimeSettingsDTO;
  setField: (key: string, value: unknown) => void;
  err: string | null;
  ok: string | null;
  saving: boolean;
  onSave: () => Promise<void>;
};

type BaotaTargetRow = {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  apiKey?: unknown;
  skipTlsVerify?: unknown;
  default?: unknown;
};

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "ok" | "warn" | "muted";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 rounded-full px-2.5 text-xs font-medium",
        tone === "ok" && "border-emerald-200 bg-emerald-50 text-emerald-800",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "muted" && "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      {label}
    </Badge>
  );
}

function StepSection({
  index,
  title,
  description,
  icon: Icon,
  children,
}: {
  index: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">步骤 {index}</p>
            <h3 className="mt-1 text-base font-semibold text-slate-950">{title}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{description}</p>
          </div>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] leading-relaxed text-slate-500">{children}</p>;
}

const BaotaSettingsWizard: React.FC<BaotaSettingsWizardProps> = ({
  form,
  setField,
  err,
  ok,
  saving,
  onSave,
}) => {
  const configQ = useAppConfig();
  const runtimeQ = useRuntimeStatusQuery();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const cfg = configQ.data;
  const check = runtimeQ.data?.systemCheck;
  const publicTargets = cfg?.baotaTargets ?? [];
  const configuredPublicTargets = publicTargets.filter((target) => Boolean(target.url && target.hasApiKey));
  const hasLegacyConfig = Boolean(cfg?.baotaUrl && cfg?.hasBaotaApiKey);
  const apiConfigured = hasLegacyConfig || configuredPublicTargets.length > 0;
  const apiReachable = apiConfigured && check?.baota.status === "success";
  const syncEnabled = Boolean(form.ingressBaotaSyncEnabled);
  const certificateReady = Boolean(form.hasBaotaSSLMaterial || form.baotaSslCertName);
  const btTargets: BaotaTargetRow[] = Array.isArray(form.baotaTargets)
    ? ([...form.baotaTargets] as BaotaTargetRow[])
    : [];

  const setBtTargets = (next: BaotaTargetRow[]) => {
    setField("baotaTargets", next.length ? next : undefined);
  };

  const refreshStatus = () => {
    void configQ.refetch();
    void runtimeQ.refetch();
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">接入向导</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">宝塔设置接入向导</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              先完成默认面板接入，再配置 Ingress 同步与 HTTPS 证书。多宝塔实例和低频网络参数集中放在高级配置里，避免主流程被运维细节打散。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={refreshStatus}>
              {runtimeQ.isFetching || configQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新状态
            </Button>
            <Button type="button" size="sm" onClick={() => void onSave()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存宝塔设置
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">面板 API</span>
              <StatusBadge
                tone={apiReachable ? "ok" : apiConfigured ? "warn" : "muted"}
                label={apiReachable ? "可达" : apiConfigured ? "待检查" : "未配置"}
              />
            </div>
            <p className="mt-2 truncate text-xs text-slate-600" title={check?.baota.msg || cfg?.baotaUrl || ""}>
              {check?.baota.msg || cfg?.baotaUrl || "保存地址与 API Key 后启用"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">密钥状态</span>
              <StatusBadge tone={apiConfigured ? "ok" : "muted"} label={apiConfigured ? "已保存" : "未保存"} />
            </div>
            <p className="mt-2 text-xs text-slate-600">API Key 留空会保留服务端已保存密钥。</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">Ingress 同步</span>
              <StatusBadge tone={syncEnabled ? "ok" : "muted"} label={syncEnabled ? "已开启" : "未开启"} />
            </div>
            <p className="mt-2 text-xs text-slate-600">后台任务开关保存后热重载。</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">HTTPS 证书</span>
              <StatusBadge tone={certificateReady ? "ok" : "muted"} label={certificateReady ? "可用" : "未设置"} />
            </div>
            <p className="mt-2 truncate text-xs text-slate-600" title={String(form.baotaSslCertName ?? "")}>
              {form.baotaSslCertName ? String(form.baotaSslCertName) : "可使用证书名或 PEM/KEY"}
            </p>
          </div>
        </div>
      </section>

      <StepSection
        index={1}
        title="面板接入"
        description="维护平台对外地址和默认宝塔面板 API。系统自带的 127.0.0.1 只是占位值，保存真实面板地址与 API Key 后才算接入。"
        icon={Server}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>平台对外地址 platformPublicUrl</Label>
            <Input
              value={String(form.platformPublicUrl ?? "")}
              onChange={(e) => setField("platformPublicUrl", e.target.value)}
              placeholder="https://console.example.com"
            />
            <FieldHint>用于生成回调、分享或外部访问链接；留空时沿用服务端默认值。</FieldHint>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>宝塔面板地址 baotaUrl</Label>
            <Input
              className="font-mono text-xs"
              value={String(form.baotaUrl ?? "")}
              onChange={(e) => setField("baotaUrl", e.target.value)}
              placeholder="例如 https://bt.example.com:8888"
            />
            <FieldHint>未使用多实例列表时必填；请填写浏览器和后端都能访问的面板根地址。</FieldHint>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>宝塔 API Key baotaApiKey（留空保留已保存密钥）</Label>
            <Input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              value={String(form.baotaApiKey ?? "")}
              onChange={(e) => setField("baotaApiKey", e.target.value)}
            />
          </div>
        </div>
      </StepSection>

      <StepSection
        index={2}
        title="同步策略"
        description="控制 Ingress 到宝塔站点与反向代理的同步入口，并设置默认回源地址、端口和协议。"
        icon={Route}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Ingress ↔ 宝塔同步</p>
              <p className="mt-1 text-xs text-slate-500">开启后后台同步任务会处理带注解的 Ingress；关闭时仍可保留面板接入配置。</p>
            </div>
            <Switch
              checked={Boolean(form.ingressBaotaSyncEnabled)}
              onCheckedChange={(x) => setField("ingressBaotaSyncEnabled", x)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>DDNS / 节点访问地址 ddnsHost</Label>
              <Input
                value={String(form.ddnsHost ?? "")}
                onChange={(e) => setField("ddnsHost", e.target.value)}
                placeholder="例如 203.0.113.10 或 edge.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>默认上游端口 defaultPort</Label>
              <Input
                value={String(form.defaultPort ?? "")}
                onChange={(e) => setField("defaultPort", e.target.value)}
                placeholder="如 80"
              />
            </div>
            <div className="space-y-2">
              <Label>同步间隔 syncIntervalSec</Label>
              <Input
                type="number"
                min={5}
                value={Number(form.syncIntervalSec ?? 30)}
                onChange={(e) => setField("syncIntervalSec", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>回源地址 baotaUpstreamHost（可选）</Label>
              <Input
                value={String(form.baotaUpstreamHost ?? "")}
                onChange={(e) => setField("baotaUpstreamHost", e.target.value)}
                placeholder="留空则回退到 ddnsHost"
              />
            </div>
            <div className="space-y-2">
              <Label>回源协议 baotaUpstreamScheme</Label>
              <Select
                value={String(form.baotaUpstreamScheme ?? "").trim() === "https" ? "https" : "http"}
                onValueChange={(v) => setField("baotaUpstreamScheme", v === "https" ? "https" : "http")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">HTTP</SelectItem>
                  <SelectItem value="https">HTTPS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>回源端口 baotaUpstreamPort（可选）</Label>
              <Input
                value={String(form.baotaUpstreamPort ?? "")}
                onChange={(e) => setField("baotaUpstreamPort", e.target.value)}
                placeholder="留空则按协议走默认端口"
              />
            </div>
          </div>
          <FieldHint>入口控制器安装、清单下载和节点监听端口请在「集群设置」维护；本页只维护宝塔接入与同步策略。</FieldHint>
        </div>
      </StepSection>

      <StepSection
        index={3}
        title="HTTPS 证书"
        description="配置宝塔侧 HTTPS 使用的证书名，或写入平台保存的 PEM/KEY 内容。PEM/KEY 保存后不会再通过接口回显。"
        icon={ShieldCheck}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>宝塔证书夹名称 baotaSslCertName（可选）</Label>
            <Input
              value={String(form.baotaSslCertName ?? "")}
              onChange={(e) => setField("baotaSslCertName", e.target.value)}
              placeholder="例如 example-com"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>PEM 内容 baotaSslPemContent（可选）</Label>
              <YamlEditor
                value={String(form.baotaSslPemContent ?? "")}
                onChange={(value) => setField("baotaSslPemContent", value)}
                height="180px"
              />
            </div>
            <div className="space-y-2">
              <Label>KEY 内容 baotaSslKeyContent（可选）</Label>
              <YamlEditor
                value={String(form.baotaSslKeyContent ?? "")}
                onChange={(value) => setField("baotaSslKeyContent", value)}
                height="180px"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">已保存平台证书内容</span>
              <StatusBadge tone={form.hasBaotaSSLMaterial ? "ok" : "muted"} label={form.hasBaotaSSLMaterial ? "已保存" : "未保存"} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-700">清空已保存 PEM/KEY clearBaotaSslMaterial</span>
              <Switch
                checked={Boolean(form.clearBaotaSslMaterial)}
                onCheckedChange={(x) => setField("clearBaotaSslMaterial", x)}
              />
            </div>
          </div>
          <FieldHint>证书来源优先级：平台已保存 PEM/KEY &gt; Ingress 证书名 &gt; 本页配置的证书名。</FieldHint>
        </div>
      </StepSection>

      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                  <SlidersHorizontal className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">步骤 4</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-950">高级配置</h3>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                    多宝塔实例、TLS 兼容和探活超时属于低频配置，默认折叠；需要企业版多节点或排障时再展开。
                  </p>
                </div>
              </div>
              {advancedOpen ? <ChevronDown className="mt-1 h-4 w-4 text-slate-500" /> : <ChevronRight className="mt-1 h-4 w-4 text-slate-500" />}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-5 border-t border-slate-100 p-5">
            <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/60 p-4">
              <div>
                <p className="text-sm font-semibold text-amber-950">多宝塔实例（企业版 / 多节点）</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                  非空时以本列表为准；Ingress 可用 <code className="rounded bg-white px-0.5 font-mono text-[10px]">kube-bt-sync.io/baota-target</code> 指定实例 id。未注解则同步到默认实例。
                </p>
              </div>
              {btTargets.map((row, idx) => (
                <div
                  key={idx}
                  className="grid gap-3 rounded-lg border border-amber-200/80 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs">id（小写、数字、连字符）</Label>
                    <Input
                      className="font-mono text-xs"
                      value={String(row.id ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], id: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="如 hk-edge"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">显示名称</Label>
                    <Input
                      value={String(row.name ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], name: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="如 香港边缘"
                    />
                  </div>
                  <div className="flex items-end gap-2 lg:col-span-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                      <input
                        type="radio"
                        name="baota-default-instance"
                        checked={Boolean(row.default)}
                        onChange={() => {
                          const next = btTargets.map((x, i) => ({ ...x, default: i === idx }));
                          setBtTargets(next);
                        }}
                        className="h-3.5 w-3.5"
                      />
                      默认实例
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        const next = btTargets.filter((_, i) => i !== idx);
                        setBtTargets(next);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">url（面板根地址）</Label>
                    <Input
                      className="font-mono text-xs"
                      value={String(row.url ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], url: e.target.value };
                        setBtTargets(next);
                      }}
                      placeholder="https://bt.example.com:8888"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">apiKey（留空或 *** 保留已保存）</Label>
                    <Input
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-xs"
                      value={String(row.apiKey ?? "")}
                      onChange={(e) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], apiKey: e.target.value };
                        setBtTargets(next);
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded border border-slate-100 px-2 py-2 sm:col-span-2 lg:col-span-3">
                    <span className="text-xs text-slate-700">跳过 TLS 校验（仅该实例）</span>
                    <Switch
                      checked={Boolean(row.skipTlsVerify)}
                      onCheckedChange={(x) => {
                        const next = [...btTargets];
                        next[idx] = { ...next[idx], skipTlsVerify: x };
                        setBtTargets(next);
                      }}
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => {
                  setBtTargets([
                    ...btTargets,
                    {
                      id: "",
                      name: "",
                      url: "",
                      apiKey: "",
                      skipTlsVerify: false,
                      default: btTargets.length === 0,
                    },
                  ]);
                }}
              >
                <Plus className="h-4 w-4" />
                添加实例
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">跳过全局 TLS 证书校验 baotaSkipTlsVerify</span>
                <Switch
                  checked={Boolean(form.baotaSkipTlsVerify)}
                  onCheckedChange={(x) => setField("baotaSkipTlsVerify", x)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-700">禁用 HTTP Keep-Alive baotaDisableHttpKeepalive</span>
                <Switch
                  checked={Boolean(form.baotaDisableHttpKeepalive)}
                  onCheckedChange={(x) => setField("baotaDisableHttpKeepalive", x)}
                />
              </div>
              <div className="space-y-2">
                <Label>HTTP 超时 baotaHttpTimeoutSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaHttpTimeoutSec ?? 45)}
                  onChange={(e) => setField("baotaHttpTimeoutSec", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>TCP 探活超时 baotaTcpProbeTimeoutSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaTcpProbeTimeoutSec ?? 5)}
                  onChange={(e) => setField("baotaTcpProbeTimeoutSec", Number(e.target.value))}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>探活最小间隔 baotaCheckMinIntervalSec</Label>
                <Input
                  type="number"
                  min={1}
                  value={Number(form.baotaCheckMinIntervalSec ?? 90)}
                  onChange={(e) => setField("baotaCheckMinIntervalSec", Number(e.target.value))}
                />
              </div>
            </div>
          </CollapsibleContent>
        </section>
      </Collapsible>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}
      {ok ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</div> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={refreshStatus}>
          {runtimeQ.isFetching || configQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          刷新状态
        </Button>
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          保存宝塔设置
        </Button>
      </div>
    </div>
  );
};

export default BaotaSettingsWizard;
