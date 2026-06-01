import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  TimerReset,
} from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { extractErrorMessage } from "@/lib/extract-error-message";
import { cn } from "@/lib/utils";

function StatusBadge({
  loading,
  configured,
  ok,
}: {
  loading: boolean;
  configured: boolean;
  ok: boolean;
}) {
  const text = loading ? "检查中" : !configured ? "待配置" : ok ? "API 可达" : "待检查";
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        loading
          ? "border-slate-200 bg-slate-50 text-slate-600"
          : !configured
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-orange-200 bg-orange-50 text-orange-900"
      )}
    >
      {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
      {text}
    </Badge>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string; size?: number }>;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
          <Icon size={17} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

const BaotaDashboard: React.FC = () => {
  const configQ = useAppConfig();
  const runtimeQ = useRuntimeStatusQuery();
  const cfg = configQ.data;
  const check = runtimeQ.data?.systemCheck;

  const targets = cfg?.baotaTargets ?? [];
  const configuredTargets = targets.filter((target) => Boolean(target.url && target.hasApiKey));
  const legacyConfigured = Boolean(cfg?.baotaUrl && cfg?.hasBaotaApiKey);
  const baotaConfigured = legacyConfigured || configuredTargets.length > 0;
  const baotaOk = baotaConfigured && check?.baota.status === "success";
  const defaultTarget = targets.find((target) => target.default) ?? targets[0];
  const primaryUrl = defaultTarget?.url || cfg?.baotaUrl || "";
  const ddnsHost = cfg?.ddnsHost?.trim() || "";
  const syncEnabled = Boolean(cfg?.ingressBaotaSyncEnabled);
  const hasHttpsMaterial = Boolean(cfg?.baotaSslCertName || cfg?.hasBaotaSSLMaterial);
  const statusHint = !baotaConfigured
    ? "保存面板地址与 API Key 后启用宝塔 API 能力。"
    : check?.baota.msg || "宝塔 API 状态来自运行时探活。";

  return (
    <div className="w-full max-w-[1920px] space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-white px-5 py-6 shadow-sm sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-orange-600 text-white shadow-sm">
              <Server className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-950">宝塔工作台</h1>
                <StatusBadge loading={runtimeQ.isLoading} configured={baotaConfigured} ok={baotaOk} />
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                管理宝塔面板 API、DDNS、HTTPS 证书材料与 Ingress 同步入口。这里展示宝塔自身配置与连通性，不依赖 Kubernetes 连接。
              </p>
              <p className="mt-2 max-w-3xl break-all text-xs text-slate-500">{statusHint}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void configQ.refetch();
                void runtimeQ.refetch();
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新状态
            </Button>
            <Button asChild size="sm" className="bg-amber-700 hover:bg-amber-800">
              <Link to="/cluster/baota/settings">
                <Settings className="mr-2 h-4 w-4" />
                宝塔设置
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {runtimeQ.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {extractErrorMessage(runtimeQ.error)}
        </div>
      ) : null}

      {!configQ.isLoading && !baotaConfigured ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">宝塔尚未配置</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">
              默认地址只是初始值；请保存真实面板地址与 API Key。保存后工作台会显示连通状态，Ingress 同步入口也会可用。
            </p>
          </div>
          <Button asChild size="sm" className="shrink-0 bg-amber-700 hover:bg-amber-800">
            <Link to="/cluster/baota/settings">
              <Settings className="mr-2 h-4 w-4" />
              去配置
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          icon={KeyRound}
          label="面板 API"
          value={baotaConfigured ? (baotaOk ? "可达" : "待检查") : "未配置"}
          hint={primaryUrl || "未保存面板地址"}
        />
        <MetricCard
          icon={Server}
          label="宝塔实例"
          value={configuredTargets.length || (legacyConfigured ? 1 : 0)}
          hint={targets.length > 0 ? "多实例配置" : "默认实例"}
        />
        <MetricCard
          icon={Globe}
          label="DDNS"
          value={ddnsHost ? "已设置" : "未设置"}
          hint={ddnsHost || "可选，用于域名解析联动"}
        />
        <MetricCard
          icon={ShieldCheck}
          label="HTTPS 材料"
          value={hasHttpsMaterial ? "可用" : "未设置"}
          hint={cfg?.baotaSslCertName || "证书名或 PEM/KEY"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4 text-amber-700" />
              面板配置
            </CardTitle>
            <CardDescription>面板地址、API Key、多实例、DDNS 与 HTTPS 证书材料。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/cluster/baota/settings">
                打开设置
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TimerReset className="h-4 w-4 text-amber-700" />
              Ingress 同步
            </CardTitle>
            <CardDescription>
              {syncEnabled ? "定时同步已开启；可进入同步页查看进度与历史报告。" : "定时同步未开启；仍可进入同步页手动触发。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/cluster/baota/sync">
                查看同步
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-amber-700" />
              Ingress Rules
            </CardTitle>
            <CardDescription>创建或查看带宝塔同步注解的 Kubernetes Ingress。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/cluster/baota/ingress">
                打开规则
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">实例与回源摘要</CardTitle>
          <CardDescription>仅展示宝塔模块自己的配置摘要；Kubernetes Ingress 连接状态请到同步页查看。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
          {(targets.length > 0 ? targets : [{ id: "default", name: "默认实例", url: cfg?.baotaUrl || "", hasApiKey: !!cfg?.hasBaotaApiKey }]).map(
            (target) => (
              <div key={target.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{target.name || target.id}</p>
                  {target.default ? <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">默认</Badge> : null}
                </div>
                <p className="mt-2 truncate font-mono text-xs text-slate-600" title={target.url || "未配置"}>
                  {target.url || "未配置"}
                </p>
                <p className="mt-2 text-xs text-slate-500">{target.hasApiKey ? "API Key 已保存" : "API Key 未保存"}</p>
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BaotaDashboard;
