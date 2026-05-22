import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon,
  AlertCircle,
  AppWindow,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Layers,
  LogIn,
  Monitor,
  Network,
  RefreshCw,
  Server,
  Shield,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { useAuth } from "@/auth/auth-context";
import { ApiHttpError, apiPostJson, type SystemCheck } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TechBadge } from "@/features/auth/components/login/TechBadge";
import { K8sLogo } from "@/features/auth/components/login/TechLogos";
import "./Login.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const BRAND_LOGO = "/brand-logo.svg";

type LoginChallenge = {
  captchaRequired: boolean;
  captchaId?: string;
  question?: string;
};

type LoginRuntimeSummary = {
  k8sConnected?: boolean;
  k8sRuntimeConfigured?: boolean;
  vcenterConfigured?: boolean;
  vcenterRuntimeConfigured?: boolean;
  redisConfigured?: boolean;
  redisConnected?: boolean;
  mysqlDsnConfigured?: boolean;
  mysqlReachable?: boolean;
  baotaConfigured?: boolean;
  ddnsConfigured?: boolean;
  ingressBaotaSyncEnabled?: boolean;
  syncIntervalSec?: number;
};

type LoginPublicPayload = {
  systemCheck: SystemCheck;
  runtime?: LoginRuntimeSummary;
};

async function fetchLoginChallenge(): Promise<LoginChallenge> {
  try {
    const r = await fetch(`${API_BASE}/api/auth/login-challenge`, { credentials: "same-origin" });
    if (!r.ok) return { captchaRequired: false };
    return (await r.json()) as LoginChallenge;
  } catch {
    return { captchaRequired: false };
  }
}

async function fetchLoginPublicStatus(signal?: AbortSignal): Promise<LoginPublicPayload> {
  const r = await fetch(`${API_BASE}/api/login/public-status`, { credentials: "same-origin", signal });
  if (!r.ok) throw new Error(`public-status ${r.status}`);
  return (await r.json()) as LoginPublicPayload;
}

function mapLoginApiError(e: ApiHttpError): string {
  const m = (e.serverMessage || "").trim();
  if (e.status === 401) return "密码错误";
  if (m.includes("验证码")) return m.startsWith("请") ? m : "验证码错误";
  if (m) return m;
  return "登录失败";
}

function mapTotpApiError(e: ApiHttpError): string {
  const m = (e.serverMessage || "").trim();
  if (e.status === 401) {
    if (m.includes("过期") || m.includes("重新")) return m;
    return m || "验证码错误";
  }
  if (m) return m;
  return "验证失败";
}

type LoginPasswordResponse = { message?: string } | { needsTotp: true; totpToken: string };

function safeRedirectPath(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/")) return "/";
  if (from.startsWith("/login")) return "/";
  return from;
}

function LoginErrorPanel({ err, hint }: { err: string | null; hint: string | null }) {
  if (!err && !hint) return null;
  return (
    <div className="space-y-2">
      {err ? (
        <p className="rounded-lg border border-red-100 bg-red-50/90 px-3 py-2 text-sm text-red-700" role="alert">
          {err}
        </p>
      ) : null}
      {hint ? (
        <div
          className="rounded-lg border border-slate-200/90 bg-slate-50/95 px-3 py-2.5 text-left shadow-sm shadow-slate-200/40"
          role="region"
          aria-label="排查提示"
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">提示</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{hint}</p>
        </div>
      ) : null}
    </div>
  );
}

/** OIDC 入口：沿用 Login.css 运维卡片（login-card-ops / 顶条），与历史浅色样式一致 */
function LoginOidcOpsCard({ href, showLocalDivider }: { href: string; showLocalDivider: boolean }) {
  return (
    <div className="login-oidc-ops-card mb-7 space-y-3 sm:mb-8">
      <div
        className={cn(
          "login-card login-card-ops relative overflow-hidden rounded-xl border border-slate-200/90 shadow-sm",
          "dark:border-slate-600/90"
        )}
      >
        <div className="login-card-top-accent" aria-hidden />
        <a
          href={href}
          className={cn(
            "login-oidc-ops-link group flex min-h-[3.5rem] w-full items-center gap-3 px-4 py-4 pl-5 transition sm:min-h-[3.75rem] sm:gap-4 sm:px-5 sm:py-5",
            "text-left text-slate-900 dark:text-slate-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950"
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500/12 to-indigo-500/12 ring-1 ring-slate-200/90 dark:from-cyan-400/10 dark:to-indigo-400/10 dark:ring-slate-600">
            <Shield className="h-5 w-5 text-[#0891b2] dark:text-cyan-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
              SSO · OIDC
            </p>
            <p className="truncate text-base font-semibold sm:text-lg">使用 OIDC SSO 登录</p>
            <p className="truncate text-xs text-slate-500 sm:text-[13px] dark:text-slate-400">跳转授权后返回控制台</p>
          </div>
          <ChevronRight
            className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#1a5ec8] dark:group-hover:text-cyan-400"
            aria-hidden
          />
        </a>
      </div>
      {showLocalDivider ? (
        <div className="flex items-center gap-2.5 pt-0.5 sm:gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-slate-400">或本地账号</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
      ) : null}
    </div>
  );
}

function LoginSuccessOverlay() {
  return (
    <div className="login-success-overlay" role="status" aria-live="polite">
      <div className="login-success-inner">
        <div className="login-success-logo">
          <img src={BRAND_LOGO} alt="" width={280} height={86} />
        </div>
        <div className="login-success-check-wrap" aria-hidden>
          <svg className="login-success-check-svg" viewBox="0 0 52 52" fill="none">
            <circle className="login-success-check-circle" cx="26" cy="26" r="24" />
            <path className="login-success-check-mark" d="M14 27l8 8 16-16" />
          </svg>
        </div>
        <p className="login-success-title">已登录</p>
        <p className="login-success-sub">正在进入…</p>
        <div className="login-success-bar" aria-hidden />
      </div>
    </div>
  );
}

type PublicStatusSummary = {
  label: string;
  hint?: string;
  tone: "ok" | "warn" | "pending" | "hidden";
};

type LoginStatusTone = PublicStatusSummary["tone"];

type LoginStatusTile = {
  label: string;
  state: string;
  detail: string;
  tone: LoginStatusTone;
  icon: React.ReactNode;
};

function normalizeProbeStatus(status?: string): string {
  return (status || "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function isNotConfiguredStatus(status: string): boolean {
  return status === "" || status === "not_configured" || status === "unconfigured" || status === "skipped";
}

function shortStatusLabel(status?: string): string {
  const s = normalizeProbeStatus(status);
  if (s === "success") return "正常";
  if (isNotConfiguredStatus(s)) return "未配置";
  if (s === "warning") return "待检查";
  if (s === "error") return "异常";
  if (s === "hidden") return "未登录受限";
  if (s === "not_detected") return "未检测";
  return "待确认";
}

function serviceStatusSummary(kind: "baota" | "ddns", item: { status?: string } | undefined): PublicStatusSummary {
  const s = normalizeProbeStatus(item?.status);
  if (isNotConfiguredStatus(s)) {
    return {
      label: "未配置",
      hint: kind === "baota" ? "未配置宝塔面板 API" : "未配置 DDNS 域名",
      tone: "pending",
    };
  }
  if (s === "success") {
    return {
      label: "正常",
      hint: kind === "baota" ? "宝塔面板已接入" : "DDNS 解析已接入",
      tone: "ok",
    };
  }
  if (s === "warning") {
    return {
      label: "待检查",
      hint: kind === "baota" ? "宝塔连通性待确认" : "默认端口待确认",
      tone: "warn",
    };
  }
  if (s === "error") {
    return {
      label: "异常",
      hint: kind === "baota" ? "宝塔已配置但暂不可达" : "DDNS 已配置但检查异常",
      tone: "warn",
    };
  }
  if (s === "hidden") {
    return { label: "未登录受限", hint: "登录后查看详情", tone: "hidden" };
  }
  return { label: shortStatusLabel(s), hint: "登录后查看详情", tone: "pending" };
}

function ingressStatusSummary(k8s: SystemCheck["k8s"] | undefined): PublicStatusSummary {
  if (k8s?.ingressInstalled) {
    return {
      label: "已检测",
      hint: k8s.ingressHostNetwork ? "HostNetwork 模式" : "控制器就绪",
      tone: "ok",
    };
  }
  return { label: "未检测", hint: "未检测到 Ingress 控制器", tone: "pending" };
}

function statusToneClasses(tone: LoginStatusTone) {
  const map: Record<LoginStatusTone, { card: string; icon: string; dot: string; chip: string }> = {
    ok: {
      card: "border-emerald-100 bg-emerald-50/70 dark:border-emerald-500/20 dark:bg-emerald-500/10",
      icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
      dot: "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]",
      chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    },
    warn: {
      card: "border-amber-100 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-500/10",
      icon: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
      dot: "bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.13)]",
      chip: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
    },
    pending: {
      card: "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50",
      icon: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
      dot: "bg-slate-400",
      chip: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
    },
    hidden: {
      card: "border-slate-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/50",
      icon: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
      dot: "bg-slate-300 dark:bg-slate-600",
      chip: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
    },
  };
  return map[tone];
}

function formatRuntimeInterval(sec?: number): string {
  if (!sec || sec <= 0) return "未设置";
  if (sec < 60) return `${sec}s`;
  if (sec % 60 === 0) return `${sec / 60}min`;
  return `${Math.floor(sec / 60)}min ${sec % 60}s`;
}

function publicServiceTile(
  label: string,
  summary: PublicStatusSummary,
  configured: boolean | undefined,
  icon: React.ReactNode
): LoginStatusTile {
  if (!configured || summary.tone === "pending") {
    return {
      label,
      state: "未配置",
      detail: label === "宝塔" ? "面板 API 待接入" : "域名解析待接入",
      tone: "pending",
      icon,
    };
  }
  if (summary.tone === "ok") {
    return { label, state: "已接入", detail: summary.hint ?? "探活正常", tone: "ok", icon };
  }
  if (summary.tone === "warn") {
    return { label, state: summary.label, detail: summary.hint ?? "需要检查", tone: "warn", icon };
  }
  return { label, state: summary.label, detail: summary.hint ?? "登录后查看详情", tone: summary.tone, icon };
}

function runtimeConnectionTile({
  label,
  configured,
  connected,
  configuredDetail,
  pendingDetail,
  icon,
}: {
  label: string;
  configured?: boolean;
  connected?: boolean;
  configuredDetail: string;
  pendingDetail: string;
  icon: React.ReactNode;
}): LoginStatusTile {
  if (connected) return { label, state: "已连接", detail: configuredDetail, tone: "ok", icon };
  if (configured) return { label, state: "连接异常", detail: "配置存在，当前进程未连通", tone: "warn", icon };
  return { label, state: "未配置", detail: pendingDetail, tone: "pending", icon };
}

function LoginRuntimeStatusPanel({
  payload,
  loading,
  error,
}: {
  payload: LoginPublicPayload | undefined;
  loading: boolean;
  error: Error | null;
}) {
  const rt = payload?.runtime;
  const baotaSummary = serviceStatusSummary("baota", payload?.systemCheck?.baota);
  const ddnsSummary = serviceStatusSummary("ddns", payload?.systemCheck?.ddns);
  const ingressSummary = ingressStatusSummary(payload?.systemCheck?.k8s);

  const tiles: LoginStatusTile[] = loading
    ? [
        "Kubernetes",
        "vCenter",
        "Redis",
        "MySQL",
        "宝塔",
        "DDNS",
      ].map((label) => ({
        label,
        state: "检查中",
        detail: "正在读取公开状态",
        tone: "hidden" as const,
        icon:
          label === "Kubernetes" ? (
            <Layers className="h-4 w-4" />
          ) : label === "vCenter" ? (
            <Monitor className="h-4 w-4" />
          ) : label === "Redis" ? (
            <Server className="h-4 w-4" />
          ) : label === "MySQL" ? (
            <Database className="h-4 w-4" />
          ) : label === "宝塔" ? (
            <ActivityIcon className="h-4 w-4" />
          ) : (
            <Network className="h-4 w-4" />
          ),
      }))
    : [
        runtimeConnectionTile({
          label: "Kubernetes",
          configured: rt?.k8sRuntimeConfigured,
          connected: rt?.k8sConnected,
          configuredDetail: "集群客户端已就绪",
          pendingDetail: "请在集群设置接入",
          icon: <Layers className="h-4 w-4" />,
        }),
        {
          label: "vCenter",
          state: rt?.vcenterConfigured ? "已配置" : "未配置",
          detail: rt?.vcenterConfigured ? "凭据与地址已保存" : rt?.vcenterRuntimeConfigured ? "凭据不完整" : "虚拟化入口待接入",
          tone: rt?.vcenterConfigured ? "ok" : rt?.vcenterRuntimeConfigured ? "warn" : "pending",
          icon: <Monitor className="h-4 w-4" />,
        },
        runtimeConnectionTile({
          label: "Redis",
          configured: rt?.redisConfigured,
          connected: rt?.redisConnected,
          configuredDetail: "缓存与镜像通道可用",
          pendingDetail: "缓存能力待接入",
          icon: <Server className="h-4 w-4" />,
        }),
        runtimeConnectionTile({
          label: "MySQL",
          configured: rt?.mysqlDsnConfigured,
          connected: rt?.mysqlReachable,
          configuredDetail: "平台元数据可写入",
          pendingDetail: "平台元数据未持久化",
          icon: <Database className="h-4 w-4" />,
        }),
        publicServiceTile("宝塔", baotaSummary, rt?.baotaConfigured, <ActivityIcon className="h-4 w-4" />),
        publicServiceTile("DDNS", ddnsSummary, rt?.ddnsConfigured, <Network className="h-4 w-4" />),
      ];

  const readyCount = tiles.filter((item) => item.tone === "ok").length;
  const warnCount = tiles.filter((item) => item.tone === "warn").length;
  const pendingCount = tiles.filter((item) => item.tone === "pending").length;
  const overallTone: LoginStatusTone = loading ? "hidden" : warnCount > 0 ? "warn" : pendingCount > 0 ? "pending" : "ok";
  const overallClass = statusToneClasses(overallTone);
  const headline = loading
    ? "正在检查运行状态"
    : error
      ? "状态暂不可用"
      : warnCount > 0
        ? `${warnCount} 项需要处理`
        : pendingCount > 0
          ? `${readyCount}/${tiles.length} 项已就绪`
          : "核心链路已就绪";

  return (
    <section
      className="login-v2-fade-in-up login-v2-d300 w-full rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900/60 dark:shadow-black/20"
      aria-label="运行状态"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <ActivityIcon className="h-3.5 w-3.5 text-[#4a8c3a]" aria-hidden />
            运行状态
          </div>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-slate-950 dark:text-slate-50 sm:text-xl">{headline}</h2>
        </div>
        <div className={cn("inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold", overallClass.chip)}>
          <span className={cn("h-2 w-2 rounded-full", overallClass.dot)} aria-hidden />
          {loading ? "检查中" : warnCount > 0 ? "有告警" : pendingCount > 0 ? "待完善" : "健康"}
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>公开状态读取失败：{error.message}</span>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 min-[460px]:grid-cols-2">
          {tiles.map((item) => {
            const toneClass = statusToneClasses(item.tone);
            return (
              <div key={item.label} className={cn("flex min-h-[52px] items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-colors", toneClass.card)}>
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", toneClass.icon)}>{item.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                    <p className="truncate text-[11px] leading-snug text-slate-500 dark:text-slate-400" title={item.detail}>
                      {item.detail}
                    </p>
                  </div>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", toneClass.chip)}>
                  {item.tone === "ok" ? (
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                  ) : item.tone === "warn" ? (
                    <AlertCircle className="h-3 w-3" aria-hidden />
                  ) : (
                    <Clock3 className="h-3 w-3" aria-hidden />
                  )}
                  {item.state}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/80">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          同步间隔 {loading ? "…" : formatRuntimeInterval(rt?.syncIntervalSec)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/80">
          <Layers className="h-3.5 w-3.5" aria-hidden />
          Ingress {loading ? "检查中" : ingressSummary.label}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/80">
          <Clock3 className="h-3.5 w-3.5" aria-hidden />
          宝塔同步 {loading ? "检查中" : rt?.ingressBaotaSyncEnabled ? "已启用" : "未启用"}
        </span>
      </div>
    </section>
  );
}

const HERO_MODULE_ITEMS = [
  {
    name: "Kubernetes",
    version: "集群",
    color: "#326de6",
    floatClass: "login-float-0",
    glowClass: "login-shadow-glow-k8s",
    logo: <K8sLogo size={52} />,
  },
  {
    name: "虚拟化与主机",
    version: "vCenter / PVE",
    color: "#7c3aed",
    floatClass: "login-float-1",
    glowClass: "login-shadow-glow-docker",
    logo: <Monitor size={52} strokeWidth={1.8} color="#7c3aed" />,
  },
  {
    name: "网络设备",
    version: "iKuai / OpenWrt",
    color: "#0e7490",
    floatClass: "login-float-2",
    glowClass: "login-shadow-glow-go",
    logo: <Network size={52} strokeWidth={1.8} color="#0e7490" />,
  },
  {
    name: "宝塔",
    version: "面板 / Ingress",
    color: "#ea580c",
    floatClass: "login-float-3",
    glowClass: "login-shadow-glow-prom",
    logo: <Server size={52} strokeWidth={1.8} color="#ea580c" />,
  },
  {
    name: "应用中心",
    version: "Redis / Hermes",
    color: "#059669",
    floatClass: "login-float-0",
    glowClass: "login-shadow-glow-vcenter",
    logo: <AppWindow size={52} strokeWidth={1.8} color="#059669" />,
  },
  {
    name: "堡垒机",
    version: "SSH / Redis CLI",
    color: "#047857",
    floatClass: "login-float-1",
    glowClass: "login-shadow-glow-vcenter",
    logo: <Terminal size={52} strokeWidth={1.8} color="#047857" />,
  },
  {
    name: "AI 巡检",
    version: "OpenClaw",
    color: "#0891b2",
    floatClass: "login-float-2",
    glowClass: "login-shadow-glow-go",
    logo: <Sparkles size={52} strokeWidth={1.8} color="#0891b2" />,
  },
  {
    name: "文档仓库",
    version: "Markdown",
    color: "#6d28d9",
    floatClass: "login-float-3",
    glowClass: "login-shadow-glow-docker",
    logo: <BookOpen size={52} strokeWidth={1.8} color="#6d28d9" />,
  },
] as const;

const LOGIN_MODULE_CHIPS = [
  { name: "Kubernetes", color: "#2563eb" },
  { name: "虚拟化与主机", color: "#7c3aed" },
  { name: "网络设备", color: "#0e7490" },
  { name: "宝塔", color: "#ea580c" },
  { name: "应用中心", color: "#059669" },
  { name: "堡垒机", color: "#047857" },
  { name: "AI 巡检", color: "#0891b2" },
  { name: "文档仓库", color: "#6d28d9" },
] as const;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, loading, refetch } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [errHint, setErrHint] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [challenge, setChallenge] = useState<LoginChallenge>({ captchaRequired: false });
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [loginStep, setLoginStep] = useState<"password" | "totp">("password");
  const [totpToken, setTotpToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const pubQ = useQuery({
    queryKey: ["login-public-status"],
    queryFn: ({ signal }) => fetchLoginPublicStatus(signal),
    staleTime: 25_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const q = p.get("error");
    const h = p.get("hint");
    if (!q && !h) return;
    if (q) setErr(q);
    if (h) setErrHint(h);
    p.delete("error");
    p.delete("hint");
    const qs = p.toString();
    navigate({ pathname: location.pathname, search: qs ? `?${qs}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  /** 大屏禁止 html/body 纵向滚动（避免双滚动条）；小屏允许纵向滚动，避免营销区把登录表单顶出可视区。 */
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => {
      if (mq.matches) {
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
      } else {
        html.style.overflow = prevHtml;
        body.style.overflow = prevBody;
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  const redirectTarget = useMemo(() => {
    const st = (location.state as { from?: unknown } | null)?.from;
    if (typeof st === "string") {
      return safeRedirectPath(st);
    }
    const r = new URLSearchParams(location.search).get("redirect");
    if (r) {
      try {
        return safeRedirectPath(decodeURIComponent(r));
      } catch {
        return "/";
      }
    }
    return "/";
  }, [location.state, location.search]);

  const oidcHref = useMemo(() => {
    const base = `${API_BASE}/api/auth/oidc/login`;
    if (status?.oidcLogin !== true) return base;
    if (redirectTarget === "/") return base;
    return `${base}?redirect=${encodeURIComponent(redirectTarget)}`;
  }, [status?.oidcLogin, redirectTarget]);

  useEffect(() => {
    if (loading || !status) return;
    if (!status.authRequired || status.loggedIn) {
      if (loginSuccess) return;
      navigate(redirectTarget, { replace: true });
    }
  }, [loading, status, navigate, loginSuccess, redirectTarget]);

  useEffect(() => {
    if (!loginSuccess) return;
    const t = window.setTimeout(() => {
      navigate(redirectTarget, { replace: true });
    }, 900);
    return () => window.clearTimeout(t);
  }, [loginSuccess, navigate, redirectTarget]);

  useEffect(() => {
    if (loading || !status) return;
    if (!status.authRequired || status.loggedIn) return;
    if (status.passwordLogin === false) return;
    void fetchLoginChallenge().then(setChallenge);
  }, [loading, status]);

  const resetToPasswordStep = () => {
    setLoginStep("password");
    setTotpToken("");
    setTotpCode("");
    setErrHint(null);
  };

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setErrHint(null);
    try {
      const body: Record<string, string> = { username, password };
      if (challenge.captchaRequired && challenge.captchaId) {
        body.captchaId = challenge.captchaId;
        body.captchaAnswer = captchaAnswer.trim();
      }
      const data = await apiPostJson<LoginPasswordResponse>("/api/auth/login", body);
      if ("needsTotp" in data && data.needsTotp) {
        setTotpToken(data.totpToken);
        setLoginStep("totp");
        setTotpCode("");
        return;
      }
      await refetch();
      setLoginSuccess(true);
    } catch (e) {
      if (e instanceof ApiHttpError && e.path.includes("/api/auth/login")) {
        setErr(mapLoginApiError(e));
        setErrHint(e.serverHint?.trim() ? e.serverHint : null);
      } else {
        setErr((e as Error).message);
        setErrHint(null);
      }
      void fetchLoginChallenge().then(setChallenge);
      setCaptchaAnswer("");
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    setErrHint(null);
    try {
      await apiPostJson("/api/auth/login-totp", { totpToken, code: totpCode.trim() });
      await refetch();
      setLoginSuccess(true);
    } catch (e) {
      if (e instanceof ApiHttpError) {
        setErr(mapTotpApiError(e));
        setErrHint(e.serverHint?.trim() ? e.serverHint : null);
      } else {
        setErr((e as Error).message);
        setErrHint(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const shell = (
    <div className="login-page-v2 relative h-full min-h-full w-full overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="login-page-v2-grid-bg login-page-v2-grid-bg--pulse pointer-events-none absolute inset-0 opacity-70" />
      <div
        className="login-page-v2-scan-line pointer-events-none absolute left-0 right-0 top-0 h-px opacity-20"
        style={{
          background: "linear-gradient(90deg, transparent, var(--login-v2-primary, #1a5ec8), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full blur-3xl opacity-[0.06]"
        style={{ background: "var(--login-v2-k8s, #326de6)" }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/3 h-72 w-72 rounded-full blur-3xl opacity-[0.05]"
        style={{ background: "var(--login-v2-vc, #6ab04c)" }}
      />
    </div>
  );

  if (loading || !status) {
    return (
      <div className="relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
        <div className="absolute inset-0 z-0">{shell}</div>
        <div className="relative z-10 flex min-h-[100dvh] min-h-screen w-full items-center justify-center px-4 py-6">
          <div className="login-v2-fade-in-up mx-auto flex w-full max-w-[min(100vw-2rem,400px)] flex-col items-center gap-4 rounded-2xl border border-slate-200/90 bg-white/95 px-6 py-7 shadow-sm sm:px-10 sm:py-8 dark:border-slate-700 dark:bg-slate-900/90">
            <img src={BRAND_LOGO} alt="" width={200} height={61} className="h-9 w-auto object-contain opacity-90 sm:h-10" />
            <div className="flex items-center gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
              <span className="text-sm text-slate-500">加载中</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showPassword = status.passwordLogin !== false;
  const showOidc = status.oidcLogin === true;

  if (!status.authRequired || status.loggedIn) {
    return (
      <div className="relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto lg:overflow-y-hidden">
        <div className="absolute inset-0 z-0">{shell}</div>
        <div className="relative z-10 flex min-h-[100dvh] min-h-screen w-full items-center justify-center px-4 py-6">
          <div className="login-v2-fade-in-up mx-auto flex w-full max-w-[min(100vw-2rem,400px)] flex-col items-center gap-4 rounded-2xl border border-slate-200/90 bg-white/95 px-6 py-7 shadow-sm sm:px-10 sm:py-8 dark:border-slate-700 dark:bg-slate-900/90">
            <img src={BRAND_LOGO} alt="" width={200} height={61} className="h-9 w-auto object-contain opacity-90 sm:h-10" />
            <span className="text-sm text-slate-500">正在跳转</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-v2 relative min-h-[100dvh] min-h-screen w-full overflow-x-hidden overflow-y-auto bg-white lg:overflow-y-hidden dark:bg-slate-950">
      <div className="login-page-v2-grid-bg login-page-v2-grid-bg--pulse pointer-events-none absolute inset-0 opacity-60" />
      <div
        className="login-page-v2-scan-line pointer-events-none absolute left-0 right-0 top-0 h-px opacity-15 dark:opacity-25"
        style={{
          background: "linear-gradient(90deg, transparent, var(--login-v2-primary, #1a5ec8), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full blur-3xl opacity-[0.05] dark:opacity-[0.08]"
        style={{ background: "#326de6" }}
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/3 h-72 w-72 rounded-full blur-3xl opacity-[0.04] dark:opacity-[0.07]"
        style={{ background: "#6ab04c" }}
      />

      {loginSuccess && <LoginSuccessOverlay />}

      <div className="relative z-10 mx-auto w-full max-w-[min(100%,92rem)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-7 md:px-9 lg:px-12 lg:pb-10 lg:pt-8 xl:px-14 xl:pt-10">
        <div className="grid w-full grid-cols-1 content-start gap-y-10 gap-x-0 py-6 sm:gap-y-12 sm:py-8 md:py-10 lg:min-h-[100dvh] lg:grid-cols-[minmax(0,1.14fr)_minmax(0,0.86fr)] lg:content-center lg:items-center lg:gap-x-12 lg:gap-y-0 lg:py-14 xl:gap-x-16 2xl:gap-x-20">
        {/* 左栏：大屏在左；小屏排在登录表单之后 */}
        <div className="order-2 flex min-h-0 w-full flex-col justify-center border-t border-slate-200/80 pt-8 dark:border-slate-800/80 lg:order-none lg:border-t-0 lg:border-r lg:border-b-0 lg:pt-0 lg:pb-0 lg:pr-10 xl:pr-14">
          <div className="mx-auto flex w-full max-w-xl flex-col space-y-5 sm:space-y-6 lg:mx-0 lg:max-w-[min(100%,46rem)] xl:max-w-[50rem]">
            <div className="login-v2-fade-in-up login-v2-d100 mb-5 flex flex-wrap items-center gap-2 sm:mb-8 sm:gap-3">
              <img src={BRAND_LOGO} alt="Kube-BT-Sync" className="h-10 w-auto max-w-[220px] object-contain sm:h-11" />
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold"
                style={{
                  borderColor: "rgba(106,176,76,0.35)",
                  color: "#3d7a2e",
                  background: "rgba(106,176,76,0.12)",
                }}
              >
                运行状态
              </span>
            </div>

            <div className="login-v2-fade-in-up login-v2-d200 mb-3 sm:mb-4">
              <h1 className="mb-2 text-[1.65rem] font-bold leading-[1.2] tracking-tight text-slate-900 sm:mb-3 sm:text-3xl sm:leading-tight md:text-4xl lg:text-[2.65rem] xl:text-5xl dark:text-slate-50">
                云原生基础设施
                <br />
                <span className="text-[#1a5ec8]">统一工作台</span>
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-400">
                统一管理 Kubernetes、虚拟化与主机、网络设备、宝塔、应用中心、堡垒机、AI 巡检与文档仓库；登录后按权限访问各模块。
              </p>
            </div>

            <LoginRuntimeStatusPanel
              payload={pubQ.data}
              loading={pubQ.isPending}
              error={pubQ.isError ? (pubQ.error as Error) : null}
            />

            <div className="login-v2-fade-in-up login-v2-d200 grid w-full grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
              {HERO_MODULE_ITEMS.map((item) => (
                <TechBadge
                  key={item.name}
                  name={item.name}
                  version={item.version}
                  color={item.color}
                  floatClass={item.floatClass}
                  glowClass={item.glowClass}
                >
                  {item.logo}
                </TechBadge>
              ))}
            </div>
          </div>
        </div>

        {/* 右栏：小屏优先展示登录表单 */}
        <div className="order-1 flex min-h-0 w-full flex-col justify-center rounded-2xl bg-slate-50/40 px-1 py-2 sm:px-2 lg:order-none lg:rounded-none lg:bg-transparent lg:px-0 lg:py-0 lg:pl-1 xl:pl-3 dark:bg-slate-900/25 dark:lg:bg-transparent">
          <div className="mx-auto w-full min-w-0 max-w-[min(100vw-2rem,28rem)] translate-x-0 sm:max-w-[min(100vw-2.5rem,30rem)] lg:mx-auto lg:max-w-[min(100%,28rem)] lg:translate-x-3 xl:max-w-[30rem] xl:translate-x-5 2xl:translate-x-6">
            <div className="login-v2-fade-in-up login-v2-d200 login-card-glow-v2 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:rounded-3xl sm:p-8 md:p-10 dark:border-slate-700 dark:bg-slate-900/85">
              <div className="mb-6 sm:mb-8">
                <div className="flex items-center gap-3 sm:gap-3.5">
                  <Terminal className="h-6 w-6 shrink-0 text-[#1a5ec8] sm:h-7 sm:w-7" aria-hidden />
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.65rem] dark:text-slate-50">登录账户</h2>
                </div>
              </div>

              <div className="mb-6 flex flex-wrap content-start gap-2 rounded-xl border border-slate-200/90 bg-slate-50/90 px-3 py-2.5 sm:mb-8 sm:gap-2.5 sm:px-4 sm:py-3 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="w-full shrink-0 text-xs font-medium text-slate-500 sm:w-auto dark:text-slate-400">
                  当前模块
                </span>
                {LOGIN_MODULE_CHIPS.map((t) => (
                  <span
                    key={t.name}
                    className="rounded-md border px-2 py-1 text-xs font-semibold dark:border-slate-600"
                    style={{
                      background: `${t.color}14`,
                      color: t.color,
                      borderColor: `${t.color}33`,
                    }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>

              {showOidc ? <LoginOidcOpsCard href={oidcHref} showLocalDivider={showPassword} /> : null}

              {showPassword && loginStep === "password" && (
                <form onSubmit={onSubmitPassword} className="flex flex-col gap-6" autoComplete="off">
                  <div className="hidden" aria-hidden>
                    <input type="text" tabIndex={-1} autoComplete="off" />
                    <input type="password" tabIndex={-1} autoComplete="off" />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Label htmlFor="login-account" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      账号
                    </Label>
                    <Input
                      id="login-account"
                      name="username"
                      autoComplete="username"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onFocus={() => {
                        setFocusedField("username");
                      }}
                      onBlur={() => setFocusedField(null)}
                      placeholder="用户名"
                      className={cn(
                        "login-v2-input h-12 rounded-xl border bg-white px-4 text-base transition dark:border-slate-600 dark:bg-slate-950 sm:text-sm",
                        focusedField === "username" ? "border-[#1a5ec8] ring-0" : "border-slate-200"
                      )}
                    />
                  </div>
                  <div className="flex flex-col gap-2.5">
                    <Label htmlFor="login-secret" className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      密码
                    </Label>
                    <div className="relative">
                      <Input
                        id="login-secret"
                        name="password"
                        type={passwordVisible ? "text" : "password"}
                        autoComplete="current-password"
                        spellCheck={false}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        className={cn(
                          "login-v2-input h-12 rounded-xl border bg-white pr-11 pl-4 text-base transition dark:border-slate-600 dark:bg-slate-950 sm:text-sm",
                          focusedField === "password" ? "border-[#1a5ec8] ring-0" : "border-slate-200"
                        )}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                        onClick={() => setPasswordVisible(!passwordVisible)}
                        aria-label={passwordVisible ? "隐藏密码" : "显示密码"}
                      >
                        {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {challenge.captchaRequired && challenge.question ? (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="login-captcha" className="text-slate-600 dark:text-slate-300">
                        验证码
                      </Label>
                      <p className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-2 font-mono text-sm font-semibold text-amber-950">
                        {challenge.question}
                      </p>
                      <Input
                        id="login-captcha"
                        name="login-captcha"
                        autoComplete="off"
                        value={captchaAnswer}
                        onChange={(e) => setCaptchaAnswer(e.target.value)}
                        placeholder="结果"
                        className="h-11 rounded-xl border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-950"
                      />
                    </div>
                  ) : null}
                  <LoginErrorPanel err={err} hint={errHint} />
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#1a5ec8] to-[#0891b2] text-base font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-60 sm:text-sm"
                  >
                    {submitting ? (
                      <>认证中…</>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        登录控制台
                      </>
                    )}
                  </Button>
                </form>
              )}

              {showPassword && loginStep === "totp" && (
                <form onSubmit={onSubmitTotp} className="flex flex-col gap-5">
                  <p className="text-center text-sm text-slate-600 dark:text-slate-300">两步验证 · 输入 6 位动态码</p>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="login-totp" className="text-slate-600 dark:text-slate-300">
                      动态码
                    </Label>
                    <Input
                      id="login-totp"
                      name="login-totp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="h-11 rounded-xl border-slate-200 bg-white font-mono text-lg tracking-widest dark:border-slate-600 dark:bg-slate-950"
                    />
                  </div>
                  <LoginErrorPanel err={err} hint={errHint} />
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 flex-1 rounded-xl border-slate-200 dark:border-slate-600"
                      disabled={submitting}
                      onClick={() => {
                        resetToPasswordStep();
                        setErr(null);
                        setErrHint(null);
                      }}
                    >
                      返回
                    </Button>
                    <Button
                      type="submit"
                      className="h-11 flex-[2] rounded-xl bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
                      disabled={submitting || totpCode.trim().length < 6}
                    >
                      {submitting ? "验证中…" : "继续"}
                    </Button>
                  </div>
                </form>
              )}

              {!showPassword && showOidc && (err || errHint) ? (
                <div className="mt-4">
                  <LoginErrorPanel err={err} hint={errHint} />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Login;
