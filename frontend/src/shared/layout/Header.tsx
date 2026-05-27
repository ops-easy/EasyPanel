import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AppWindow,
  ChevronDown,
  Hexagon,
  Home,
  LayoutDashboard,
  LogOut,
  Monitor,
  Network,
  Server,
  Sparkles,
  Settings,
  SquareTerminal,
  User,
  Users,
  Library,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { workspaceFromPathname } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import GlobalSearchBar from "@/shared/layout/GlobalSearchBar";
import { workspaceMenuVisible } from "@/lib/platform-permissions";
import { OBSERVABILITY_INSPECT_WORKSPACE_LABEL } from "@/features/ops/ai-inspect/aiInspectNavigation"; // 观测与巡检

const HeaderNotificationsSheet = React.lazy(() => import("@/shared/layout/HeaderNotificationsSheet"));

type HeaderProps = {
  tone?: "light" | "dark";
};

const Header: React.FC<HeaderProps> = ({ tone = "light" }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { status, logout } = useAuth();
  const isDark = tone === "dark";
  const workspace = workspaceFromPathname(location.pathname);
  const isHub = workspace === "hub";
  const isK8s = workspace === "kubernetes";
  const isCompute = workspace === "compute";
  const isNetwork = workspace === "network";
  const isBaota = workspace === "baota";
  const isAppcenter = workspace === "appcenter";
  const isBastion = workspace === "bastion";
  const isAiInspect = workspace === "aiinspect";
  const isDocs = workspace === "docs";

  const cfgQ = useAppConfig();
  const cfg = cfgQ.data;
  const perm = cfg?.permissions;
  const navRole = status?.role;
  const isViewer = cfg?.dashboardRole === "viewer" || cfg?.viewer === true;
  const headerShowK8s = workspaceMenuVisible(perm, "kubernetes", navRole);
  const headerShowCompute = workspaceMenuVisible(perm, "compute", navRole);
  const headerShowNetwork = workspaceMenuVisible(perm, "network", navRole);
  const headerShowBaota = workspaceMenuVisible(perm, "baota", navRole);
  const headerShowApp = workspaceMenuVisible(perm, "appcenter", navRole);
  const headerShowBastion = workspaceMenuVisible(perm, "bastion", navRole);
  const headerShowAiInspect = workspaceMenuVisible(perm, "aiinspect", navRole);
  const headerShowDocs = workspaceMenuVisible(perm, "docs", navRole);

  /** 与 MySQL 是否连通无关：管理员应始终看到入口；无库时页面内会提示配置 MySQL */
  const showPlatformUsers =
    !isViewer &&
    (status?.role === "admin" || cfg?.dashboardRole === "admin");

  const showLogout = Boolean(status?.authRequired && status.loggedIn);
  const displayName =
    status?.loggedIn && status.username
      ? status.username
      : (cfg?.dashboardUser?.trim() || "Admin");
  const userAvatarUrl = (status?.avatarUrl ?? "").trim();

  const showBackHub = location.pathname !== "/" && location.pathname !== "";
  const dropdownContentClass = cn(
    "min-w-[228px]",
    isDark && "border-slate-800 bg-[#111820] text-slate-100 shadow-2xl shadow-black/30"
  );
  const accountDropdownContentClass = cn(
    "min-w-[200px]",
    isDark && "border-slate-800 bg-[#111820] text-slate-100 shadow-2xl shadow-black/30"
  );
  const dropdownItemClass = cn("cursor-pointer gap-2 py-2.5", isDark && "focus:bg-slate-800 focus:text-slate-50");
  const accountDropdownItemClass = cn("cursor-pointer gap-2", isDark && "focus:bg-slate-800 focus:text-slate-50");
  const menuHintClass = isDark ? "text-slate-400" : "text-muted-foreground";

  return (
    <header
      data-cmp="Header"
      className={cn(
        "sticky top-0 z-50 flex h-20 w-full min-w-0 flex-shrink-0 items-center gap-3 border-b px-4 sm:px-8",
        isDark ? "border-slate-800 bg-[#0c0f14] text-slate-100" : "border-[#E2E8F0] bg-white"
      )}
    >
      {showBackHub && (
        <Link
          to="/"
          className={cn(
            "flex h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 sm:px-3",
            isDark
              ? "border-slate-800 bg-slate-900/70 text-slate-100 hover:bg-slate-800 focus-visible:ring-emerald-500/30"
              : "border-slate-200 bg-slate-50/90 text-slate-800 hover:bg-slate-100 focus-visible:ring-blue-500/30"
          )}
          title="返回工作台首页"
        >
          <LayoutDashboard size={18} className={cn("shrink-0", isDark ? "text-slate-300" : "text-slate-600")} aria-hidden />
          <span className="hidden sm:inline">工作台</span>
        </Link>
      )}

      {(cfg?.platformLogoUrl || cfg?.platformDisplayName) && (
        <div className={cn("flex min-w-0 shrink items-center gap-2 border-l pl-3 sm:pl-4", isDark ? "border-slate-800" : "border-slate-200")}>
          {cfg?.platformLogoUrl && (
            <img
              src={cfg.platformLogoUrl}
              alt=""
              className="h-8 max-h-9 max-w-[140px] object-contain"
            />
          )}
          {cfg?.platformDisplayName && (
            <span
              className={cn(
                "platform-display-name-breathe hidden max-w-[min(200px,28vw)] truncate text-sm font-semibold sm:inline",
                isDark ? "text-slate-100" : "text-slate-800"
              )}
            >
              {cfg.platformDisplayName}
            </span>
          )}
        </div>
      )}

      <GlobalSearchBar tone={tone} />

      <div className="ml-auto flex min-w-0 shrink-0 items-center space-x-2 sm:space-x-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium outline-none transition-colors",
                isDark
                  ? "border-slate-800 bg-slate-900/70 text-slate-100 hover:bg-slate-800"
                  : "border-slate-200 bg-slate-50/90 text-slate-800 hover:bg-slate-100",
                isDark ? "focus-visible:ring-2 focus-visible:ring-emerald-500/30" : "focus-visible:ring-2 focus-visible:ring-blue-500/30"
              )}
              aria-label={`切换工作区：Kubernetes、虚拟化与主机、网络设备、宝塔、应用中心、堡垒机、${OBSERVABILITY_INSPECT_WORKSPACE_LABEL}、文档仓库`}
            >
              <span
                className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                isHub
                    ? "from-slate-500 to-slate-700"
                    : isDocs
                      ? "from-zinc-700 to-violet-800"
                      : isK8s
                        ? "from-blue-600 to-blue-700"
                        : isCompute
                          ? "from-violet-600 to-violet-700"
                          : isNetwork
                            ? "from-cyan-600 to-slate-700"
                          : isBaota
                            ? "from-amber-600 to-orange-600"
                            : isBastion
                              ? "from-teal-600 to-emerald-800"
                              : isAiInspect
                                ? "from-cyan-600 to-teal-700"
                                : "from-emerald-600 to-emerald-700"
                )}
              >
                {isHub ? (
                  <Home size={17} strokeWidth={2.25} />
                ) : isDocs ? (
                  <Library size={17} strokeWidth={2.25} />
                ) : isK8s ? (
                  <Hexagon size={18} strokeWidth={2.5} />
                ) : isCompute ? (
                  <Monitor size={18} strokeWidth={2.25} />
                ) : isNetwork ? (
                  <Network size={18} strokeWidth={2.25} />
                ) : isBaota ? (
                  <Server size={17} strokeWidth={2.25} />
                ) : isBastion ? (
                  <SquareTerminal size={17} strokeWidth={2.25} />
                ) : isAiInspect ? (
                  <Sparkles size={17} strokeWidth={2.25} />
                ) : (
                  <AppWindow size={17} strokeWidth={2.25} />
                )}
              </span>
              <span className="hidden text-left sm:inline">
                {isHub
                  ? "工作台"
                  : isDocs
                    ? "文档仓库"
                    : isK8s
                      ? "Kubernetes"
                      : isCompute
                        ? "虚拟化与主机"
                        : isNetwork
                          ? "网络设备"
                        : isBaota
                          ? "宝塔"
                          : isBastion
                            ? "堡垒机"
                            : isAiInspect
                              ? OBSERVABILITY_INSPECT_WORKSPACE_LABEL
                              : "应用中心"}
              </span>
              <ChevronDown size={16} className={isDark ? "text-slate-400" : "text-slate-500"} aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={dropdownContentClass}>
            {headerShowK8s ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <Hexagon className="text-white" size={18} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">Kubernetes</span>
                <span className={cn("text-xs", menuHintClass)}>集群资源</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowCompute ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/compute/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600">
                <Monitor className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">虚拟化与主机</span>
                <span className={cn("text-xs", menuHintClass)}>vCenter · PVE · 云主机</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowNetwork ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/network/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
                <Network className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">网络设备</span>
                <span className={cn("text-xs", menuHintClass)}>iKuai · OpenWrt</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowBaota ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/baota")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600">
                <Server className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">宝塔</span>
                <span className={cn("text-xs", menuHintClass)}>Ingress 同步与面板</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowApp ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/apps/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                <AppWindow className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">应用中心</span>
                <span className={cn("text-xs", menuHintClass)}>Redis · Kafka · OpenSearch · DNS</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowBastion ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/bastion")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-emerald-800">
                <SquareTerminal className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">堡垒机</span>
                <span className={cn("truncate text-xs", menuHintClass)}>SSH / RDP / Redis CLI</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowAiInspect ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/cluster/ai-inspect/dashboard")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-600 to-teal-700">
                <Sparkles className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{OBSERVABILITY_INSPECT_WORKSPACE_LABEL}</span>
                <span className={cn("text-xs", menuHintClass)}>监控看板 · 告警通知 · 日志检索</span>
              </div>
            </DropdownMenuItem>
            ) : null}
            {headerShowDocs ? (
            <DropdownMenuItem
              className={dropdownItemClass}
              onSelect={() => navigate("/docs")}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-700 to-violet-800">
                <Library className="text-white" size={17} strokeWidth={2.25} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">文档仓库</span>
                <span className={cn("text-xs", menuHintClass)}>Markdown 笔记 · 版本 · 媒体</span>
              </div>
            </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <React.Suspense fallback={null}>
          <HeaderNotificationsSheet />
        </React.Suspense>

        <div className={cn("h-8 w-px", isDark ? "bg-slate-800" : "bg-gray-200")} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex items-center space-x-3 rounded-xl px-2 py-1.5 outline-none transition-colors focus-visible:ring-2",
                isDark ? "hover:bg-slate-900 focus-visible:ring-emerald-500/30" : "hover:bg-gray-50 focus-visible:ring-blue-500/30"
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-gradient-to-tr",
                  isDark
                    ? "border-emerald-900/70 from-slate-900 to-emerald-950 text-emerald-300"
                    : "border-blue-200 from-blue-100 to-indigo-100 text-blue-600"
                )}
              >
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User size={18} />
                )}
              </div>
              <div className="hidden text-left sm:flex sm:flex-col">
                <span className={cn("leading-none text-sm font-semibold", isDark ? "text-slate-100" : "text-gray-900")}>
                  {displayName}
                </span>
                <span className={cn("mt-0.5 text-xs", isDark ? "text-slate-400" : "text-gray-500")}>
                  {status?.authRequired ? "已登录" : "控制台"}
                </span>
              </div>
              <ChevronDown size={16} className={isDark ? "text-slate-500" : "text-gray-400"} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className={accountDropdownContentClass}>
            <DropdownMenuItem
              className={accountDropdownItemClass}
              onSelect={() => navigate("/account/personal")}
            >
              <User size={16} />
              个人中心
            </DropdownMenuItem>
            <DropdownMenuItem
              className={accountDropdownItemClass}
              onSelect={() => navigate("/account/settings")}
            >
              <Settings size={16} />
              账户与平台设置
            </DropdownMenuItem>
            {showPlatformUsers && (
              <DropdownMenuItem
                className={accountDropdownItemClass}
                onSelect={() => navigate("/account/users")}
              >
                <Users size={16} />
                平台用户管理
              </DropdownMenuItem>
            )}
            {showLogout && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer gap-2 text-red-600 focus:text-red-600"
                  onSelect={() => void logout().then(() => navigate("/login", { replace: true }))}
                >
                  <LogOut size={16} />
                  退出登录
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
