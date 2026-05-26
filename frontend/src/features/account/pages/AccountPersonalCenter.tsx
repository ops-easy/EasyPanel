import React from "react";
import { Link } from "react-router-dom";
import { AppWindow, Hexagon, Library, Monitor, Network, Server, Sparkles, SquareTerminal } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { cn } from "@/lib/utils";
import { workspaceMenuVisible, type PlatformWorkspaceMenuKey } from "@/lib/platform-permissions";
import AccountMyProfile from "@/features/account/pages/AccountMyProfile";

/** 头像下拉「个人中心」：资料、OIDC、头像与常用资源入口 */
type PersonalResourceEntry = {
  key: PlatformWorkspaceMenuKey;
  to: string;
  label: string;
  hint: string;
  iconClassName: string;
  icon: React.ComponentType<{ className?: string }>;
};

const resourceEntries: PersonalResourceEntry[] = [
  {
    key: "kubernetes",
    to: "/cluster",
    label: "Kubernetes",
    hint: "集群资源与工作负载",
    iconClassName: "bg-blue-100 text-blue-700",
    icon: Hexagon,
  },
  {
    key: "compute",
    to: "/cluster/compute/dashboard",
    label: "虚拟化与主机",
    hint: "vCenter、PVE 与云主机",
    iconClassName: "bg-violet-100 text-violet-700",
    icon: Monitor,
  },
  {
    key: "network",
    to: "/cluster/network/dashboard",
    label: "网络设备",
    hint: "iKuai、OpenWrt",
    iconClassName: "bg-slate-100 text-slate-700",
    icon: Network,
  },
  {
    key: "baota",
    to: "/cluster/baota",
    label: "宝塔",
    hint: "Ingress 同步与 DDNS",
    iconClassName: "bg-amber-100 text-amber-800",
    icon: Server,
  },
  {
    key: "appcenter",
    to: "/cluster/apps/dashboard",
    label: "应用中心",
    hint: "Redis、Kafka、OpenSearch 等",
    iconClassName: "bg-emerald-100 text-emerald-800",
    icon: AppWindow,
  },
  {
    key: "bastion",
    to: "/cluster/bastion",
    label: "堡垒机",
    hint: "SSH / RDP / Redis CLI",
    iconClassName: "bg-teal-100 text-teal-800",
    icon: SquareTerminal,
  },
  {
    key: "aiinspect",
    to: "/cluster/ai-inspect/dashboard",
    label: "AI 巡检",
    hint: "巡检、告警与日志",
    iconClassName: "bg-cyan-100 text-cyan-800",
    icon: Sparkles,
  },
  {
    key: "docs",
    to: "/docs",
    label: "文档仓库",
    hint: "Markdown 笔记与分享",
    iconClassName: "bg-purple-100 text-purple-800",
    icon: Library,
  },
];

const AccountPersonalCenter: React.FC = () => {
  const { status } = useAuth();
  const perm = status?.permissions;
  const role = status?.role;
  const visibleResources = resourceEntries.filter((entry) => workspaceMenuVisible(perm, entry.key, role));

  return (
    <div className="mx-auto max-w-4xl pb-12">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">个人中心</h1>
        <p className="mt-1 text-sm text-gray-500">登录资料、OIDC、头像；下方「我的资源」为常用入口（权限不足时自动隐藏）。</p>
      </div>

      <AccountMyProfile />

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-gray-900">我的资源</h2>
        <p className="mt-1 text-xs text-gray-500">按当前账号权限展示；平台级配置仍在「账户与平台设置」。</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {visibleResources.map((entry) => {
            const Icon = entry.icon;
            return (
              <li key={entry.key}>
                <Link
                  to={entry.to}
                  className="flex min-h-[4rem] items-center gap-3 rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2.5 text-sm font-medium text-gray-900 transition hover:bg-slate-100"
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", entry.iconClassName)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate">{entry.label}</span>
                    <span className="mt-0.5 block truncate text-xs font-normal text-gray-500">{entry.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {visibleResources.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">当前账号暂无可用资源入口，或联系管理员调整权限。</p>
        ) : null}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <Link to="/account/settings" className="text-sm font-medium text-sky-700 underline">
            打开账户与平台设置（运行时、MySQL、OIDC 全局等）
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AccountPersonalCenter;
