import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Cloud,
  Database,
  HardDrive,
  Monitor,
  Server,
  SquareTerminal,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { menuItemVisible, moduleVisible } from "@/lib/platform-permissions";

type BastionTargetRow = {
  id: string;
  provider: "vcenter" | "pve" | "extra" | string;
  name: string;
  kind?: string;
  powerState?: string;
  address?: string;
};

/**
 * 堡垒机控制台首页：汇总可进入统一终端的目标数据，覆盖 vCenter、PVE、额外主机、云主机、Redis CLI 与 MySQL SQL。
 */
const BastionConsoleHome: React.FC = () => {
  const { status: auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const cfgQ = useAppConfig();
  const perm = cfgQ.data?.permissions;
  const showApp = menuItemVisible(
    perm,
    "appcenter",
    auth?.role,
    moduleVisible(perm, "appcenter")
  );

  const bastionQ = useQuery({
    queryKey: ["bastion-console-targets"],
    queryFn: ({ signal }) =>
      apiGetJson<{ targets: BastionTargetRow[]; warnings?: string[] }>("/api/bastion/targets", { signal }),
    staleTime: 60_000,
    gcTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const hostsQ = useQuery({
    queryKey: ["bastion-console-hosts"],
    queryFn: ({ signal }) => apiGetJson<{ hosts: { name?: string }[] }>("/api/vcenter/hosts", { signal }),
    enabled: cfgQ.data?.vcenterConfigured === true,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const cloudVmQ = useQuery({
    queryKey: ["bastion-console-cloud-vm"],
    queryFn: ({ signal }) => apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/cloud-vm/instances", { signal }),
    enabled: showApp,
    staleTime: 60_000,
  });

  const redisQ = useQuery({
    queryKey: ["bastion-console-redis"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/redis/instances", { signal }),
    enabled: showApp,
    staleTime: 60_000,
  });

  const mysqlQ = useQuery({
    queryKey: ["bastion-console-mysql"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: { id: number; name: string }[] }>("/api/app-center/mysql/instances", { signal }),
    enabled: showApp,
    staleTime: 60_000,
  });

  const nativeSshQ = useQuery({
    queryKey: ["vcenter-bastion-native-ssh"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        enabled?: boolean;
        port?: number;
        hostKeyFingerprint?: string;
        hint?: string;
      }>("/api/vcenter/bastion/native-ssh", { signal }),
    staleTime: 30_000,
  });

  const targets = bastionQ.data?.targets ?? [];
  const vms = targets.filter((t) => t.provider === "vcenter");
  const pveTargets = targets.filter((t) => t.provider === "pve");
  const extras = targets.filter((t) => t.provider === "extra");
  const poweredOn = vms.filter((v) => String(v.powerState).toLowerCase().includes("on")).length;
  const nHosts = hostsQ.data?.hosts?.length ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-[#0c0f14] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-8">
        <div className="space-y-2 text-center sm:text-left">
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">堡垒机控制台</h1>
          <p className="text-sm text-slate-400">
            数据来自当前运行时已连接的 vCenter、PVE、堡垒机策略、应用中心云主机、Redis CLI 与 MySQL SQL；进入「主机与终端」可选择目标、打开 SSH / 远程桌面、SFTP、redis-cli 或 SQL 控制台。
          </p>
        </div>

        <Link
          to="/cluster/bastion/session"
          className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-800/50 bg-gradient-to-r from-emerald-950/50 to-slate-900/40 px-5 py-4 text-left ring-1 ring-emerald-900/30 transition hover:border-emerald-700/60 hover:from-emerald-950/70"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-900/40 text-emerald-300">
              <SquareTerminal className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <p className="font-medium text-emerald-100">主机与终端</p>
              <p className="text-xs text-slate-400">vCenter / PVE / 额外主机 · 多标签 SSH · Windows 网页 RDP · redis-cli · MySQL SQL</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-emerald-400/80" aria-hidden />
        </Link>

        {nativeSshQ.data?.enabled ? (
          <div className="rounded-2xl border border-sky-800/50 bg-sky-950/30 px-5 py-4 text-left">
            <p className="text-sm font-medium text-sky-200">OpenSSH 对接本机堡垒机</p>
            <p className="mt-1 text-xs text-slate-500">
              在终端使用与 Web
              相同的平台账号；连接后按提示选择目标。已开两步验证时，密码可写为「密码+6
              位」或「密码|6
              位」。
            </p>
            <p className="mt-2 font-mono text-[11px] text-slate-400">
              ssh -o StrictHostKeyChecking=accept-new -p {nativeSshQ.data?.port ?? 2222} 用户名@&lt;与访问本控制台相同可达的
              IP 或域名&gt;
            </p>
            {nativeSshQ.data?.hostKeyFingerprint ? (
              <p className="mt-1 font-mono text-[10px] text-slate-500">
                主机公钥 SHA256: {nativeSshQ.data.hostKeyFingerprint}
              </p>
            ) : null}
            {isAdmin ? (
              <p className="mt-2 text-[11px] text-amber-600/90">
                在「策略与分组」中可启停与修改端口。多副本时仅后台任务 Pod
                会监听；需将 Service / NodePort 或 hostPort 暴露到可访问的地址。
              </p>
            ) : null}
          </div>
        ) : null}

        {bastionQ.isError ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-200">
            {(bastionQ.error as Error)?.message ?? "加载堡垒机列表失败"}（请确认 vCenter / PVE 目标与堡垒机策略配置可用）
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Monitor className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">虚拟机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {bastionQ.isLoading ? "—" : vms.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">清单中可连接目标（含分组过滤前总数）</p>
            <p className="mt-2 text-xs text-emerald-600/90">已开机约 {bastionQ.isLoading ? "—" : poweredOn} 台</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Server className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">PVE VM / CT</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {bastionQ.isLoading ? "..." : pveTargets.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">来自已保存的 Proxmox VE 目标</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">额外主机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {bastionQ.isLoading ? "—" : extras.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">策略中配置的物理机 / 跳板机等</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Server className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">ESXi 主机</span>
            </div>
            <p className="text-2xl font-semibold text-slate-100">
              {!cfgQ.data?.vcenterConfigured
                ? "—"
                : hostsQ.isLoading
                  ? "…"
                  : nHosts}
            </p>
            <p className="mt-1 text-xs text-slate-500">vCenter 纳管宿主机数量</p>
          </div>

          {showApp ? (
            <>
              <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-400">
                  <Cloud className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">应用中心 · 云主机</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">
                  {cloudVmQ.isLoading ? "…" : (cloudVmQ.data?.instances?.length ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">在会话页侧栏可打开 SSH 抽屉</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-400">
                  <Database className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">应用中心 · Redis</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">
                  {redisQ.isLoading ? "…" : (redisQ.data?.instances?.length ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">redis-cli 终端快捷入口</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-[#12161c] p-4">
                <div className="mb-2 flex items-center gap-2 text-slate-400">
                  <Database className="h-4 w-4" />
                  <span className="text-xs font-medium uppercase tracking-wide">应用中心 · MySQL</span>
                </div>
                <p className="text-2xl font-semibold text-slate-100">
                  {mysqlQ.isLoading ? "…" : (mysqlQ.data?.instances?.length ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">SQL 控制台快捷入口</p>
              </div>
            </>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-[#10151b] p-5 text-left">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-100">配置入口与凭据归属</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                不同来源的终端不共用一个设置页；下面按目标类型直接进入对应配置位置。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="flex min-h-[148px] flex-col rounded-xl border border-slate-800 bg-[#121922] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Monitor className="h-4 w-4 text-sky-300" />
                  <span className="text-sm font-medium">vCenter VM</span>
                </div>
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                  全局默认
                </span>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                vCenter VM 全局 SSH：在配置中维护默认凭据，适用于未单独保存凭据的 vCenter 虚拟机。
              </p>
              <Link
                to="/cluster/compute/config"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                打开配置 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex min-h-[148px] flex-col rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Server className="h-4 w-4 text-emerald-300" />
                  <span className="text-sm font-medium">PVE VM / CT</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                  单目标
                </span>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                PVE VM/CT：选中目标后在右上角打开 SSH 设置，可单独覆盖 Host、端口、用户和密钥。
              </p>
              <Link
                to="/cluster/bastion/session"
                className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200"
              >
                去选择 PVE 目标 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="flex min-h-[148px] flex-col rounded-xl border border-slate-800 bg-[#121922] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <HardDrive className="h-4 w-4 text-amber-300" />
                  <span className="text-sm font-medium">额外主机</span>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                  策略配置
                </span>
              </div>
              <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                额外主机：在「策略与分组」里配置地址、凭据与 RDP，适合物理机、跳板机等。
              </p>
              {isAdmin ? (
                <Link
                  to="/cluster/bastion/admin"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200"
                >
                  打开策略与额外主机 <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <span className="mt-4 text-xs text-slate-500">需要管理员维护策略</span>
              )}
            </div>

            {showApp ? (
              <>
                <div className="flex min-h-[148px] flex-col rounded-xl border border-slate-800 bg-[#121922] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-200">
                      <Cloud className="h-4 w-4 text-cyan-300" />
                      <span className="text-sm font-medium">云主机</span>
                    </div>
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
                      实例详情
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                    云主机：在云主机详情中维护 SSH；堡垒机侧栏只是快捷打开。
                  </p>
                  <Link
                    to="/cluster/apps/cloud-vm"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
                  >
                    打开云主机 <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="flex min-h-[148px] flex-col rounded-xl border border-slate-800 bg-[#121922] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-200">
                      <Database className="h-4 w-4 text-violet-300" />
                      <span className="text-sm font-medium">Redis CLI</span>
                    </div>
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200">
                      非 SSH
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                    Redis CLI：使用实例连接信息，不走 SSH 凭据；在 Redis 实例列表里打开 redis-cli。
                  </p>
                  <Link
                    to="/cluster/apps/redis"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-violet-300 hover:text-violet-200"
                  >
                    打开 Redis <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="flex min-h-[148px] flex-col rounded-xl border border-slate-800 bg-[#121922] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-slate-200">
                      <Database className="h-4 w-4 text-sky-300" />
                      <span className="text-sm font-medium">MySQL SQL</span>
                    </div>
                    <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200">
                      非 SSH
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-xs leading-relaxed text-slate-400">
                    MySQL SQL：使用实例连接信息，不走 SSH 凭据；在 MySQL 实例列表里打开 SQL 控制台。
                  </p>
                  <Link
                    to="/cluster/apps/mysql"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200"
                  >
                    打开 MySQL <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            to="/cluster/bastion/session"
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-4 py-2 text-slate-200 hover:bg-slate-800"
          >
            进入主机与终端
          </Link>
          {isAdmin ? (
            <Link
              to="/cluster/bastion/admin"
              className="rounded-lg border border-slate-700 px-4 py-2 text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
            >
              策略与额外主机
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BastionConsoleHome;
