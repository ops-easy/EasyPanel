import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Server,
  Settings,
  Boxes,
  Activity as NodeActivityIcon,
  Globe,
  Monitor,
  Cloud,
  AppWindow,
  Sparkles,
  LineChart,
  Bell,
  ScrollText,
  Radar,
  Database,
  FolderTree,
  Ship,
  HardDrive,
  Shield,
  FileText,
  BarChart3,
  Library,
  Layers,
  KeyRound,
  Calendar,
  ShieldCheck,
  Hexagon,
  SquareTerminal,
  Network,
  ClipboardList,
  Cable,
  Users,
  Wifi,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useRuntimeStatusQuery } from "@/hooks/use-runtime-status";
import { WORKSPACE_STORAGE_KEY, type WorkspaceId } from "@/lib/workspace";
import { cn } from "@/lib/utils";
import { menuItemVisible, moduleVisible, workspaceMenuVisible } from "@/lib/platform-permissions";
import { apiGetJson, type K8sSidebarMenuItem } from "@/lib/api";
import { APP_CENTER_MODULE_NAV_ITEMS, isAppCenterNavItemActive } from "@/features/app-center/layout/appCenterNavigation";

type SidebarWorkspace = WorkspaceId;

type PVETarget = {
  id: string;
};

type NetworkDevice = {
  id: string;
  kind: "ikuai" | "openwrt" | string;
};

function readWorkspace(): SidebarWorkspace {
  try {
    const v = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (v === "vcenter") {
      return "compute";
    }
    if (
      v === "hub" ||
      v === "compute" ||
      v === "network" ||
      v === "kubernetes" ||
      v === "baota" ||
      v === "appcenter" ||
      v === "bastion" ||
      v === "aiinspect" ||
      v === "docs"
    ) {
      return v;
    }
  } catch {
    /* ignore */
  }
  return "kubernetes";
}

function dashboardPath(ws: SidebarWorkspace): string {
  switch (ws) {
    case "hub":
      return "/";
    case "kubernetes":
      return "/cluster";
    case "compute":
      return "/cluster/compute/dashboard";
    case "network":
      return "/cluster/network/dashboard";
    case "baota":
      return "/cluster/baota";
    case "appcenter":
      return "/cluster/apps/dashboard";
    case "bastion":
      return "/cluster/bastion";
    case "aiinspect":
      return "/cluster/ai-inspect/dashboard";
    case "docs":
      return "/docs";
    default:
      return "/cluster";
  }
}

function isDashboardActive(pathname: string, ws: SidebarWorkspace): boolean {
  const p = dashboardPath(ws);
  if (p === "/") {
    return (
      pathname === "/" ||
      pathname === "" ||
      pathname === "/settings" ||
      (pathname.startsWith("/account") &&
        !pathname.startsWith("/account/audit") &&
        !pathname.startsWith("/account/site-stats"))
    );
  }
  if (ws === "docs") {
    return (
      pathname === "/docs" ||
      pathname === "/docs/" ||
      pathname.startsWith("/docs/doc/")
    );
  }
  if (ws === "appcenter") {
    return (
      pathname === "/cluster/apps/dashboard" ||
      pathname === "/cluster/apps" ||
      pathname === "/cluster/apps/"
    );
  }
  if (ws === "compute") {
    return pathname === "/cluster/compute" || pathname === "/cluster/compute/" || pathname === "/cluster/compute/dashboard";
  }
  if (ws === "network") {
    return pathname === "/cluster/network" || pathname === "/cluster/network/" || pathname === "/cluster/network/dashboard";
  }
  if (ws === "bastion") {
    return pathname === "/cluster/bastion" || pathname === "/cluster/bastion/";
  }
  if (ws === "aiinspect") {
    // 仅总览入口高亮 Dashboard；日志查询/日志采集/监控等子页各自高亮，避免与「日志采集」同色冲突
    return (
      pathname === "/cluster/ai-inspect/dashboard" ||
      pathname === "/cluster/ai-inspect" ||
      pathname === "/cluster/ai-inspect/"
    );
  }
  if (ws === "baota") {
    return pathname === "/cluster/baota" || pathname === "/cluster/baota/";
  }
  return pathname === p || pathname === `${p}/`;
}

function navLinkTint(
  isActive: boolean,
  tint: "blue" | "violet" | "amber" | "emerald" | "slate"
) {
  const m = {
    blue: {
      active:
        "bg-blue-50 text-blue-700 shadow-[inset_4px_0_0_0_#2563eb]",
      icon: "text-blue-600",
    },
    violet: {
      active:
        "bg-violet-50 text-violet-800 shadow-[inset_4px_0_0_0_#7c3aed]",
      icon: "text-violet-600",
    },
    amber: {
      active:
        "bg-amber-50 text-amber-900 shadow-[inset_4px_0_0_0_#d97706]",
      icon: "text-amber-600",
    },
    emerald: {
      active:
        "bg-emerald-50 text-emerald-900 shadow-[inset_4px_0_0_0_#059669]",
      icon: "text-emerald-600",
    },
    slate: {
      active:
        "bg-slate-100 text-slate-900 shadow-[inset_4px_0_0_0_#64748b]",
      icon: "text-slate-600",
    },
  }[tint];
  return cn(
    "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-200",
    isActive ? m.active : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
  );
}

function iconTint(isActive: boolean, tint: "blue" | "violet" | "amber" | "emerald" | "slate") {
  if (!isActive) return "text-gray-400";
  const m = {
    blue: "text-blue-600",
    violet: "text-violet-600",
    amber: "text-amber-600",
    emerald: "text-emerald-600",
    slate: "text-slate-600",
  };
  return m[tint];
}

function NavItemText({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate">{label}</span>
      {hint ? (
        <span className="mt-0.5 truncate text-[10px] font-normal leading-3 text-gray-400">
          {hint}
        </span>
      ) : null}
    </span>
  );
}

type K8sNavItem = {
  id: K8sSidebarMenuItem["key"];
  to: string | { pathname: string; search?: string };
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  nsResource?:
    | "pods"
    | "deployments"
    | "statefulsets"
    | "daemonsets"
    | "services"
    | "pvcs"
    | "configmaps"
    | "secrets";
  /** 命名空间浏览入口（/cluster/ns…） */
  namespaceBrowse?: boolean;
  /** /cluster/rbac */
  rbacPage?: boolean;
  /** /cluster/harbor */
  harborPage?: boolean;
  /** /cluster/custom-resources */
  customResourcesPage?: boolean;
  /** /cluster/etcd */
  etcdPage?: boolean;
};

const DEFAULT_K8S_SIDEBAR_MENU: K8sSidebarMenuItem[] = [
  { key: "pods", label: "Pods", order: 10 },
  { key: "namespaces", label: "NameSpace", order: 20 },
  { key: "nodes", label: "Nodes", order: 30 },
  { key: "etcd", label: "etcd", order: 35 },
  { key: "rbac", label: "RBAC", order: 40 },
  { key: "harbor", label: "Harbor 仓库", order: 50 },
  { key: "customResources", label: "自定义资源", order: 60 },
];

const k8sNavItems: K8sNavItem[] = [
  {
    id: "pods",
    to: "/cluster/pods",
    label: "Pods",
    icon: Boxes,
    nsResource: "pods",
  },
  {
    id: "namespaces",
    to: { pathname: "/cluster/ns", search: "?resource=pods" },
    label: "NameSpace",
    icon: FolderTree,
    namespaceBrowse: true,
  },
  { id: "nodes", to: "/cluster/nodes", label: "Nodes", icon: NodeActivityIcon },
  { id: "etcd", to: "/cluster/etcd", label: "etcd", icon: Database, etcdPage: true },
  { id: "rbac", to: "/cluster/rbac", label: "RBAC", icon: Shield, rbacPage: true },
  { id: "harbor", to: "/cluster/harbor", label: "Harbor 仓库", icon: Ship, harborPage: true },
  {
    id: "customResources",
    to: "/cluster/custom-resources",
    label: "自定义资源",
    icon: Layers,
    customResourcesPage: true,
  },
];

function normalizeK8sSidebarMenu(items?: K8sSidebarMenuItem[]): K8sSidebarMenuItem[] {
  const defaults = new Map(DEFAULT_K8S_SIDEBAR_MENU.map((item) => [item.key, item]));
  const custom = new Map<string, K8sSidebarMenuItem>();
  (items ?? []).forEach((item) => {
    const base = defaults.get(item.key);
    if (!base || custom.has(item.key)) return;
    custom.set(item.key, {
      key: item.key,
      label: item.label?.trim() || base.label,
      hidden: Boolean(item.hidden),
      order: Number(item.order) || base.order,
    });
  });
  return DEFAULT_K8S_SIDEBAR_MENU.map((base) => custom.get(base.key) ?? { ...base })
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((item, index) => ({
      ...item,
      label: item.label?.trim() || defaults.get(item.key)?.label || item.key,
      order: (index + 1) * 10,
    }));
}

/** 侧栏「Pods」仅对应全集群 Pod 列表；命名空间内 Pod 归入「按命名空间浏览」 */
function isNamespaceWorkspacePath(pathname: string): boolean {
  if (pathname === "/cluster/ns" || pathname === "/cluster/ns/") return true;
  return /^\/cluster\/ns\/[^/]+\//.test(pathname);
}

function isWorkspaceResourceActive(
  resource: string,
  pathname: string,
  search: string
): boolean {
  if (resource === "pods") {
    return pathname === "/cluster/pods" || pathname.startsWith("/cluster/pods/");
  }
  const q = new URLSearchParams(search).get("resource") || "pods";
  if (pathname === "/cluster/ns" || pathname === "/cluster/ns/") {
    return q === resource;
  }
  const m = pathname.match(
    /^\/cluster\/ns\/[^/]+\/(pods|deployments|statefulsets|daemonsets|services|pvcs|configmaps|secrets)(?:\/|$)/
  );
  if (m) return m[1] === resource;
  return false;
}

function k8sItemActive(
  item: K8sNavItem,
  pathname: string,
  search: string
): boolean {
  if (item.namespaceBrowse) {
    return isNamespaceWorkspacePath(pathname);
  }
  if (item.rbacPage) {
    return pathname === "/cluster/rbac" || pathname.startsWith("/cluster/rbac/");
  }
  if (item.harborPage) {
    return pathname === "/cluster/harbor" || pathname.startsWith("/cluster/harbor/");
  }
  if (item.customResourcesPage) {
    return (
      pathname === "/cluster/custom-resources" ||
      pathname.startsWith("/cluster/custom-resources/")
    );
  }
  if (item.etcdPage) {
    return pathname === "/cluster/etcd" || pathname.startsWith("/cluster/etcd/");
  }
  if (item.nsResource) {
    return isWorkspaceResourceActive(item.nsResource, pathname, search);
  }
  const to = item.to;
  if (typeof to === "string") {
    return pathname === to || pathname.startsWith(`${to}/`);
  }
  return false;
}

function k8sItemKey(item: K8sNavItem): string {
  return item.id;
}

/** 虚拟机列表/详情高亮；排除 dashboard、宿主机、公有云、设置 */
function isVcenterVmNavActive(pathname: string): boolean {
  if (pathname === "/cluster/vcenter/dashboard") return false;
  if (pathname === "/cluster/vcenter/gpu") return false;
  if (pathname === "/cluster/vcenter/router") return false;
  if (pathname === "/cluster/vcenter") return true;
  if (
    pathname === "/cluster/vcenter/hosts" ||
    pathname.startsWith("/cluster/vcenter/hosts/") ||
    pathname === "/cluster/vcenter/cloud" ||
    pathname.startsWith("/cluster/vcenter/cloud/") ||
    pathname.startsWith("/cluster/vcenter/tools")
  ) {
    return false;
  }
  return pathname.startsWith("/cluster/vcenter/");
}

function isCloudHostsNavActive(pathname: string): boolean {
  return pathname === "/cluster/vcenter/cloud" || pathname.startsWith("/cluster/vcenter/cloud/");
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [workspace, setWorkspace] = useState<SidebarWorkspace>(() => readWorkspace());

  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
    } catch {
      /* ignore */
    }
  }, [workspace]);

  useEffect(() => {
    const path = location.pathname;
    if (path === "/" || path === "") {
      setWorkspace("hub");
    } else if (path.startsWith("/account") || path === "/settings") {
      setWorkspace("hub");
    } else if (path.startsWith("/docs")) {
      setWorkspace("docs");
    } else if (path.startsWith("/cluster/baota")) {
      setWorkspace("baota");
    } else if (path.startsWith("/cluster/compute")) {
      setWorkspace("compute");
    } else if (path.startsWith("/cluster/network")) {
      setWorkspace("network");
    } else if (path.startsWith("/cluster/vcenter")) {
      setWorkspace("compute");
    } else if (path.startsWith("/cluster/apps")) {
      setWorkspace("appcenter");
    } else if (path.startsWith("/cluster/bastion")) {
      setWorkspace("bastion");
    } else if (path.startsWith("/cluster/ai-inspect")) {
      setWorkspace("aiinspect");
    } else if (path.startsWith("/cluster")) {
      setWorkspace("kubernetes");
    }
  }, [location.pathname]);

  const runtimeQ = useRuntimeStatusQuery();
  const { status: authStatus } = useAuth();
  const navRole = authStatus?.role;

  const check = runtimeQ.data?.systemCheck;
  const cfg = runtimeQ.data?.config;
  const perm = cfg?.permissions;
  const showK8sNav = workspaceMenuVisible(perm, "kubernetes", navRole);
  const showComputeNav = workspaceMenuVisible(perm, "compute", navRole);
  const showNetworkNav = workspaceMenuVisible(perm, "network", navRole);
  const showBaotaNav = workspaceMenuVisible(perm, "baota", navRole);
  const showAppCenterNav = workspaceMenuVisible(perm, "appcenter", navRole);
  const showAiInspectNav = workspaceMenuVisible(perm, "aiinspect", navRole);
  const showDocsNav = workspaceMenuVisible(perm, "docs", navRole);
  const showBastionNav = workspaceMenuVisible(perm, "bastion", navRole);
  const showVcCloud = menuItemVisible(perm, "vcenter_cloud", navRole, moduleVisible(perm, "compute"));
  const showVcTools = menuItemVisible(perm, "vcenter_tools", navRole, moduleVisible(perm, "compute"));
  const showHarborNav = menuItemVisible(perm, "harbor", navRole, moduleVisible(perm, "k8s"));
  const showK8sClusterSettings =
    navRole === "admin" && menuItemVisible(perm, "k8s_settings", navRole, true);
  const baotaTargetConfigured = cfg?.baotaTargets?.some((t) => Boolean(t.url && t.hasApiKey)) ?? false;
  const baotaConfigured = Boolean((cfg?.hasBaotaApiKey && cfg?.baotaUrl) || baotaTargetConfigured);
  const ok = baotaConfigured && check?.baota.status === "success";
  const statusLoading = runtimeQ.isLoading;
  const isViewer = cfg?.dashboardRole === "viewer" || cfg?.viewer === true;
  const showPlatformAudit = !isViewer && navRole === "admin";
  const canFetchShellStatus = authStatus?.loggedIn === true || authStatus?.authRequired === false;

  const pveTargetsQ = useQuery({
    queryKey: ["pve-targets-shell"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
    enabled: canFetchShellStatus && showComputeNav,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const networkDevicesQ = useQuery({
    queryKey: ["network-devices-shell"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    enabled: canFetchShellStatus && showNetworkNav,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const pveTargetCount = pveTargetsQ.data?.targets?.length ?? 0;
  const pveStatusLoading = canFetchShellStatus && showComputeNav && pveTargetsQ.isLoading;
  const pveDotClass = pveStatusLoading
    ? "bg-slate-300"
    : pveTargetsQ.isError
      ? "bg-amber-500"
      : pveTargetCount > 0
        ? "bg-emerald-500"
        : "bg-slate-400";
  const pveStatusLabel = pveStatusLoading
    ? "PVE …"
    : pveTargetsQ.isError
      ? "PVE 未配置"
      : pveTargetCount > 0
        ? "PVE 已连接"
        : "PVE 未配置";
  const pveEntryHint = pveStatusLoading
    ? "PVE 检查中"
    : pveTargetsQ.isError
      ? "PVE 未配置"
      : pveTargetCount > 0
        ? "PVE 已连接"
        : "PVE 未配置";

  const openWrtDeviceCount =
    networkDevicesQ.data?.devices?.filter((device) => device.kind === "openwrt").length ?? 0;
  const openWrtStatusLoading = canFetchShellStatus && showNetworkNav && networkDevicesQ.isLoading;
  const openWrtDotClass = openWrtStatusLoading
    ? "bg-slate-300"
    : networkDevicesQ.isError
      ? "bg-amber-500"
      : openWrtDeviceCount > 0
        ? "bg-emerald-500"
        : "bg-slate-400";
  const openWrtStatusLabel = openWrtStatusLoading
    ? "OpenWrt …"
    : networkDevicesQ.isError
      ? "OpenWrt 未配置"
      : openWrtDeviceCount > 0
        ? "OpenWrt 已连接"
        : "OpenWrt 未配置";
  const openWrtEntryHint = openWrtStatusLoading
    ? "OpenWrt 检查中"
    : networkDevicesQ.isError
      ? "OpenWrt 未配置"
      : openWrtDeviceCount > 0
        ? "OpenWrt 已连接"
        : "OpenWrt 未配置";

  const k8sLive = cfg?.k8sConfigured === true;
  const k8sFile = cfg?.k8sRuntimeConfigured === true;
  const k8sDotClass = statusLoading
    ? "bg-slate-300"
    : k8sLive
      ? "bg-emerald-500"
      : k8sFile
        ? "bg-amber-500"
        : "bg-slate-400";
  const k8sStatusLabel = statusLoading
    ? "Kubernetes …"
    : k8sLive
      ? "Kubernetes 已连接"
      : "Kubernetes 未配置";

  const vcLive = cfg?.vcenterConfigured === true;

  const redisAddrOk = isViewer
    ? cfg?.redisAddrPresent === true
    : cfg?.redisConfigured === true;
  const redisDotClass = statusLoading
    ? "bg-slate-300"
    : isViewer
      ? redisAddrOk
        ? "bg-emerald-500"
        : "bg-slate-400"
      : !cfg?.redisConfigured
        ? "bg-amber-500"
        : cfg?.redisConnected
          ? "bg-emerald-500"
          : "bg-amber-500";
  const redisStatusLabel = statusLoading
    ? "Redis …"
    : isViewer
      ? redisAddrOk
        ? "Redis 已连接"
        : "Redis 未配置"
      : !cfg?.redisConfigured
        ? "Redis 未配置"
        : cfg?.redisConnected
          ? "Redis 已连接"
          : "Redis 未配置";

  const k8sNavFiltered = isViewer
    ? k8sNavItems.filter(
        (i) =>
          i.harborPage ||
          (i.nsResource !== "pods" && i.nsResource !== "configmaps")
      )
    : k8sNavItems;
  const k8sSidebarMenu = normalizeK8sSidebarMenu(cfg?.k8sSidebarMenu);
  const k8sSidebarMenuMap = new Map(k8sSidebarMenu.map((item) => [item.key, item]));
  const k8sNavComposed = k8sNavFiltered
    .map((item) => {
      const override = k8sSidebarMenuMap.get(item.id);
      return {
        ...item,
        label: override?.label?.trim() || item.label,
        hidden: Boolean(override?.hidden),
        order: override?.order ?? 0,
      };
    })
    .filter((item) => !item.hidden)
    .sort((a, b) => a.order - b.order);

  const isHub = workspace === "hub";
  const isDocs = workspace === "docs";
  const isK8s = workspace === "kubernetes";
  const isCompute = workspace === "compute";
  const isNetwork = workspace === "network";
  const isBaota = workspace === "baota";
  const isAppcenter = workspace === "appcenter";
  const isBastion = workspace === "bastion";
  const isAiinspect = workspace === "aiinspect";

  const dashActive = isDashboardActive(location.pathname, workspace);
  const dashTo = dashboardPath(workspace);

  const appCenterDnsActive =
    location.pathname === "/cluster/apps/dns" ||
    location.pathname.startsWith("/cluster/apps/dns/");

  const aiInspectReportsActive =
    location.pathname === "/cluster/ai-inspect/reports" ||
    location.pathname.startsWith("/cluster/ai-inspect/reports/");
  const aiInspectConfigureActive =
    location.pathname === "/cluster/ai-inspect/configure" ||
    location.pathname.startsWith("/cluster/ai-inspect/configure/");
  const aiInspectMonitoringActive = location.pathname.startsWith("/cluster/ai-inspect/monitoring");
  const aiInspectAlertsActive = location.pathname.startsWith("/cluster/ai-inspect/alerts");
  const aiInspectLogsActive = location.pathname.startsWith("/cluster/ai-inspect/logs");
  const aiInspectLogCollectionActive = location.pathname.startsWith("/cluster/ai-inspect/log-collection");

  const docsMediaActive =
    location.pathname === "/docs/media" || location.pathname.startsWith("/docs/media/");
  const docsGuidesActive =
    location.pathname === "/docs/guides" || location.pathname.startsWith("/docs/guides/");

  const computeProviderConfigured = Boolean(vcLive || pveTargetCount > 0);
  const computeGuestsActive =
    location.pathname === "/cluster/compute/guests" ||
    location.pathname.startsWith("/cluster/compute/guests/") ||
    location.pathname === "/cluster/compute/vcenter/vms" ||
    location.pathname.startsWith("/cluster/compute/vcenter/vms/") ||
    location.pathname === "/cluster/compute/pve/guests" ||
    location.pathname.startsWith("/cluster/compute/pve/guests/") ||
    location.pathname === "/cluster/vcenter" ||
    isVcenterVmNavActive(location.pathname);
  const computeHostsActive =
    location.pathname === "/cluster/compute/hosts" ||
    location.pathname.startsWith("/cluster/compute/hosts/") ||
    location.pathname === "/cluster/compute/vcenter/hosts" ||
    location.pathname.startsWith("/cluster/compute/vcenter/hosts/") ||
    location.pathname === "/cluster/compute/pve/nodes" ||
    location.pathname.startsWith("/cluster/compute/pve/nodes/") ||
    location.pathname === "/cluster/vcenter/hosts" ||
    location.pathname.startsWith("/cluster/vcenter/hosts/");
  const computeStorageActive =
    location.pathname === "/cluster/compute/storage" ||
    location.pathname.startsWith("/cluster/compute/storage/") ||
    location.pathname === "/cluster/compute/pve/storage";
  const computeActivityActive =
    location.pathname === "/cluster/compute/activity" ||
    location.pathname.startsWith("/cluster/compute/activity/") ||
    location.pathname === "/cluster/compute/pve/tasks";
  const computeConfigActive =
    location.pathname === "/cluster/compute/config" ||
    location.pathname.startsWith("/cluster/compute/config/") ||
    location.pathname === "/cluster/compute/config" ||
    location.pathname === "/cluster/compute/pve/targets";
  const computeCloudActive =
    location.pathname === "/cluster/compute/cloud" ||
    location.pathname.startsWith("/cluster/compute/cloud/") ||
    isCloudHostsNavActive(location.pathname);
  const computeToolboxActive =
    location.pathname.startsWith("/cluster/compute/tools") ||
    location.pathname.startsWith("/cluster/vcenter/tools");
  const computeBastionActive = location.pathname.startsWith("/cluster/bastion");
  const networkDevicesActive =
    location.pathname === "/cluster/network/devices" ||
    location.pathname === "/cluster/network/ikuai" ||
    location.pathname === "/cluster/network/ikuai/dashboard" ||
    location.pathname === "/cluster/network/openwrt" ||
    location.pathname === "/cluster/network/openwrt/dashboard" ||
    location.pathname === "/cluster/network/ikuai/apps";
  const networkInterfacesActive =
    location.pathname === "/cluster/network/interfaces" ||
    location.pathname === "/cluster/network/ikuai/interfaces" ||
    location.pathname === "/cluster/network/openwrt/interfaces";
  const networkClientsActive =
    location.pathname === "/cluster/network/clients" ||
    location.pathname === "/cluster/network/ikuai/clients" ||
    location.pathname === "/cluster/network/ikuai/vm-mapping" ||
    location.pathname === "/cluster/network/openwrt/clients";
  const networkWirelessActive =
    location.pathname === "/cluster/network/wireless" ||
    location.pathname === "/cluster/network/openwrt/wireless";
  const networkConnectionsActive =
    location.pathname === "/cluster/network/connections" ||
    location.pathname === "/cluster/network/openwrt/connections";
  const networkMonitoringActive =
    location.pathname === "/cluster/network/monitoring" ||
    location.pathname === "/cluster/network/ikuai/exporter" ||
    location.pathname === "/cluster/network/openwrt/exporter";
  const networkConfigActive =
    location.pathname === "/cluster/network/access" ||
    location.pathname.startsWith("/cluster/network/access/") ||
    location.pathname === "/cluster/network/config" ||
    location.pathname.startsWith("/cluster/network/config/");

  const brandLabel = isDocs
    ? "文档仓库"
    : isHub
      ? "工作台"
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
              : isAiinspect
                ? "AI 巡检"
                : "应用中心";

  const brandClass = isDocs
    ? "text-violet-600/90"
    : isHub
      ? "text-slate-600/90"
      : isK8s
        ? "text-blue-600/90"
        : isCompute
          ? "text-violet-600/90"
          : isNetwork
            ? "text-cyan-600/90"
          : isBaota
            ? "text-amber-600/90"
            : isBastion
              ? "text-teal-600/90"
              : isAiinspect
                ? "text-cyan-600/90"
                : "text-emerald-600/90";

  const dashTint: "blue" | "violet" | "amber" | "emerald" | "slate" = isDocs
    ? "violet"
    : isHub
      ? "slate"
      : isK8s
        ? "blue"
        : isCompute
          ? "violet"
          : isNetwork
            ? "slate"
          : isBaota
            ? "amber"
            : isBastion
              ? "emerald"
              : isAiinspect
                ? "slate"
                : isAppcenter
                  ? "slate"
                  : "emerald";

  const dashLabel = isBastion ? "控制台" : "Dashboard";

  return (
    <aside
      data-cmp="Sidebar"
      data-workspace={workspace}
      className="z-10 flex w-[260px] flex-shrink-0 flex-col border-r border-[#E2E8F0] bg-white"
    >
      <div className="border-b border-[#E2E8F0] px-3 py-3">
        <div className="flex w-full items-center gap-2 rounded-xl px-2 py-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white p-1 shadow-sm">
            <img
              src={cfg?.platformLogoUrl?.trim() ? cfg.platformLogoUrl.trim() : "/favicon.svg"}
              alt=""
              width={40}
              height={40}
              className="h-8 w-8 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-base font-bold leading-tight text-gray-900",
                cfg?.platformDisplayName?.trim() ? "platform-display-name-breathe" : undefined
              )}
            >
              {cfg?.platformDisplayName?.trim() || "Kube-BT-Sync"}
            </span>
            <span
              className={cn(
                "mt-0.5 block text-[11px] font-semibold uppercase tracking-wide transition-colors duration-300",
                brandClass
              )}
            >
              {brandLabel}
            </span>
            <span className="mt-1 block text-[10px] leading-tight text-gray-400">
              工作区切换见顶部栏
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
        {!isBastion ? (
          <Link
            to={dashTo}
            className={navLinkTint(dashActive, dashTint)}
          >
            {isDocs ? (
              <Library size={20} className={iconTint(dashActive, dashTint)} />
            ) : (
              <LayoutDashboard size={20} className={iconTint(dashActive, dashTint)} />
            )}
            <span>{dashLabel}</span>
          </Link>
        ) : null}

        {isDocs && navRole === "admin" ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Markdown
              </p>
            </div>
            <Link to="/docs/media" className={navLinkTint(docsMediaActive, "violet")}>
              <FileText size={20} className={iconTint(docsMediaActive, "violet")} />
              <span>媒体与附件</span>
            </Link>
            <Link to="/docs/guides" className={navLinkTint(docsGuidesActive, "violet")}>
              <ClipboardList size={20} className={iconTint(docsGuidesActive, "violet")} />
              <span>页面指南</span>
            </Link>
          </>
        ) : null}

        {isHub ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                模块入口
              </p>
            </div>
            {showK8sNav && (
              <Link to="/cluster" className={navLinkTint(false, "blue")}>
                <Hexagon size={20} className="text-gray-400" />
                <span>Kubernetes</span>
              </Link>
            )}
            {showComputeNav && (
              <Link to="/cluster/compute/dashboard" className={navLinkTint(false, "violet")}>
                <Monitor size={20} className="text-gray-400" />
                <NavItemText label="虚拟化与主机" hint={pveEntryHint} />
              </Link>
            )}
            {showNetworkNav && (
              <Link to="/cluster/network/dashboard" className={navLinkTint(false, "slate")}>
                <Network size={20} className="text-gray-400" />
                <NavItemText label="网络设备" hint={openWrtEntryHint} />
              </Link>
            )}
            {showBaotaNav && (
              <Link to="/cluster/baota" className={navLinkTint(false, "amber")}>
                <Server size={20} className="text-gray-400" />
                <span>宝塔</span>
              </Link>
            )}
            {showAppCenterNav && (
              <Link to="/cluster/apps/dashboard" className={navLinkTint(false, "emerald")}>
                <AppWindow size={20} className="text-gray-400" />
                <span>应用中心</span>
              </Link>
            )}
            {showBastionNav && (
              <Link to="/cluster/bastion" className={navLinkTint(false, "emerald")}>
                <SquareTerminal size={20} className="text-gray-400" />
                <span>堡垒机</span>
              </Link>
            )}
            {showAiInspectNav && (
              <Link to="/cluster/ai-inspect/dashboard" className={navLinkTint(false, "slate")}>
                <Sparkles size={20} className="text-gray-400" />
                <span>AI 巡检</span>
              </Link>
            )}
            {showDocsNav && (
              <Link to="/docs" className={navLinkTint(false, "violet")}>
                <Library size={20} className="text-gray-400" />
                <span>文档仓库</span>
              </Link>
            )}
            {showPlatformAudit && (
              <>
                <div className="px-4 pb-1 pt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    管理
                  </p>
                </div>
                <Link
                  to="/account/audit"
                  className={navLinkTint(
                    location.pathname === "/account/audit" || location.pathname.startsWith("/account/audit/"),
                    "slate"
                  )}
                >
                  <FileText
                    size={20}
                    className={iconTint(
                      location.pathname === "/account/audit" || location.pathname.startsWith("/account/audit/"),
                      "slate"
                    )}
                  />
                  <span>平台审计</span>
                </Link>
                <Link
                  to="/account/site-stats"
                  className={navLinkTint(location.pathname === "/account/site-stats", "slate")}
                >
                  <BarChart3 size={20} className={iconTint(location.pathname === "/account/site-stats", "slate")} />
                  <span>站点统计</span>
                </Link>
              </>
            )}
          </>
        ) : null}

        {isDocs ? null : isHub ? null : showK8sNav && isK8s ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">集群</p>
            </div>
            {k8sNavComposed.map((item) => {
              if (item.harborPage && !showHarborNav) return null;
              const isActive = k8sItemActive(item, location.pathname, location.search);
              const Icon = item.icon;
              return (
                <Link key={k8sItemKey(item)} to={item.to} className={navLinkTint(isActive, "blue")}>
                  <Icon size={20} className={iconTint(isActive, "blue")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            {showK8sClusterSettings ? (
              <Link
                to="/cluster/settings"
                className={navLinkTint(location.pathname === "/cluster/settings", "blue")}
              >
                <Settings
                  size={20}
                  className={iconTint(location.pathname === "/cluster/settings", "blue")}
                />
                <span>集群设置</span>
              </Link>
            ) : null}
          </>
        ) : showComputeNav && isCompute ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                虚拟化与主机
              </p>
            </div>
            {computeProviderConfigured ? (
              <>
                <Link
                  to="/cluster/compute/guests"
                  className={navLinkTint(computeGuestsActive, "violet")}
                >
                  <Monitor
                    size={20}
                    className={iconTint(computeGuestsActive, "violet")}
                  />
                  <span>虚拟机 / CT</span>
                </Link>
                <Link
                  to="/cluster/compute/hosts"
                  className={navLinkTint(computeHostsActive, "violet")}
                >
                  <Server
                    size={20}
                    className={iconTint(computeHostsActive, "violet")}
                  />
                  <span>宿主机 / 节点</span>
                </Link>
                <Link
                  to="/cluster/compute/storage"
                  className={navLinkTint(computeStorageActive, "violet")}
                >
                  <Database
                    size={20}
                    className={iconTint(computeStorageActive, "violet")}
                  />
                  <span>存储</span>
                </Link>
                <Link
                  to="/cluster/compute/activity"
                  className={navLinkTint(computeActivityActive, "violet")}
                >
                  <NodeActivityIcon
                    size={20}
                    className={iconTint(computeActivityActive, "violet")}
                  />
                  <span>任务活动</span>
                </Link>
              </>
            ) : (
              <div className="mx-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                尚未接入 vCenter 或 PVE，资源入口将在配置完成后显示。
              </div>
            )}
            {showVcCloud ? (
              <Link
                to="/cluster/compute/cloud"
                className={navLinkTint(computeCloudActive, "violet")}
              >
                <Cloud
                  size={20}
                  className={iconTint(computeCloudActive, "violet")}
                />
                <span>公有云</span>
              </Link>
            ) : null}
            {showBastionNav ? (
              <Link
                to="/cluster/bastion"
                className={navLinkTint(computeBastionActive, "emerald")}
              >
                <SquareTerminal
                  size={20}
                  className={iconTint(computeBastionActive, "emerald")}
                />
                <span>堡垒机</span>
              </Link>
            ) : null}
            {showVcTools ? (
              <Link
                to="/cluster/compute/tools/ip-scan"
                className={navLinkTint(computeToolboxActive, "violet")}
              >
                <Radar
                  size={20}
                  className={iconTint(computeToolboxActive, "violet")}
                />
                <span>IP 扫描</span>
              </Link>
            ) : null}
            <Link
              to="/cluster/compute/config"
              className={navLinkTint(computeConfigActive, "violet")}
            >
              <Settings
                size={20}
                className={iconTint(computeConfigActive, "violet")}
              />
              <span>配置</span>
            </Link>
          </>
        ) : showNetworkNav && isNetwork ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                网络资源
              </p>
            </div>
            <Link
              to="/cluster/network/devices"
              className={navLinkTint(networkDevicesActive, "slate")}
            >
              <Network
                size={20}
                className={iconTint(networkDevicesActive, "slate")}
              />
              <span>设备</span>
            </Link>
            <Link
              to="/cluster/network/interfaces"
              className={navLinkTint(networkInterfacesActive, "slate")}
            >
              <Cable
                size={20}
                className={iconTint(networkInterfacesActive, "slate")}
              />
              <span>接口</span>
            </Link>
            <Link
              to="/cluster/network/clients"
              className={navLinkTint(networkClientsActive, "slate")}
            >
              <Users
                size={20}
                className={iconTint(networkClientsActive, "slate")}
              />
              <span>终端</span>
            </Link>
            <Link
              to="/cluster/network/wireless"
              className={navLinkTint(networkWirelessActive, "slate")}
            >
              <Wifi
                size={20}
                className={iconTint(networkWirelessActive, "slate")}
              />
              <span>无线</span>
            </Link>
            <Link
              to="/cluster/network/connections"
              className={navLinkTint(networkConnectionsActive, "slate")}
            >
              <NodeActivityIcon
                size={20}
                className={iconTint(networkConnectionsActive, "slate")}
              />
              <span>防火墙</span>
            </Link>
            <Link
              to="/cluster/network/monitoring"
              className={navLinkTint(networkMonitoringActive, "slate")}
            >
              <Gauge
                size={20}
                className={iconTint(networkMonitoringActive, "slate")}
              />
              <span>监控</span>
            </Link>
            <Link
              to="/cluster/network/access"
              className={navLinkTint(networkConfigActive, "slate")}
            >
              <Settings
                size={20}
                className={iconTint(networkConfigActive, "slate")}
              />
              <span>配置</span>
            </Link>
          </>
        ) : showBaotaNav && isBaota ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                宝塔
              </p>
            </div>
            <Link
              to="/cluster/baota/ingress"
              className={navLinkTint(
                location.pathname === "/cluster/baota/ingress",
                "amber"
              )}
            >
              <Globe size={20} className={iconTint(location.pathname === "/cluster/baota/ingress", "amber")} />
              <span>Ingress Rules</span>
            </Link>
            <Link
              to="/cluster/baota/sync"
              className={navLinkTint(location.pathname === "/cluster/baota/sync", "amber")}
            >
              <Server size={20} className={iconTint(location.pathname === "/cluster/baota/sync", "amber")} />
              <span>Ingress 同步</span>
            </Link>
          </>
        ) : showAppCenterNav && isAppcenter ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                应用中心
              </p>
            </div>
            {APP_CENTER_MODULE_NAV_ITEMS.map((item) => {
              const active = isAppCenterNavItemActive(location.pathname, item);
              const Icon = item.icon;
              if (item.id === "dns") {
                const dnsExact = location.pathname === "/cluster/apps/dns" || location.pathname === "/cluster/apps/dns/";
                const dnsParentCls = dnsExact
                  ? navLinkTint(true, "emerald")
                  : appCenterDnsActive
                    ? "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium text-emerald-700 hover:bg-gray-50"
                    : "flex items-center space-x-3 rounded-xl px-4 py-3.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900";
                return (
                  <Link key={item.id} to={item.to} className={dnsParentCls}>
                    <Icon size={20} className={dnsExact ? "text-emerald-600" : appCenterDnsActive ? "text-emerald-500" : "text-gray-400"} />
                    <span>{item.sidebarLabel}</span>
                  </Link>
                );
              }
              return (
                <Link key={item.id} to={item.to} className={navLinkTint(active, "emerald")}>
                  <Icon size={20} className={iconTint(active, "emerald")} />
                  <span>{item.sidebarLabel}</span>
                </Link>
              );
            })}
            {appCenterDnsActive && (
              <div className="ml-3 border-l-2 border-blue-100 pl-2">
                {[
                  { to: "/cluster/apps/dns/accounts", label: "服务商账号", Icon: KeyRound },
                  { to: "/cluster/apps/dns/domains",  label: "域名管理",   Icon: Globe },
                  { to: "/cluster/apps/dns/records",  label: "解析记录",   Icon: Server },
                  { to: "/cluster/apps/dns/failover", label: "健康监测",   Icon: NodeActivityIcon },
                  { to: "/cluster/apps/dns/scheduled",label: "定时任务",   Icon: Calendar },
                  { to: "/cluster/apps/dns/certs",    label: "SSL 证书",   Icon: ShieldCheck },
                ].map(({ to, label, Icon }) => {
                  const active = location.pathname === to || location.pathname.startsWith(to + "/");
                  return (
                    <Link key={to} to={to} className={navLinkTint(active, "blue")}>
                      <Icon size={16} className={iconTint(active, "blue")} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        ) : showAiInspectNav && isAiinspect ? (
          <>
            <div className="px-4 pb-1 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                AI 巡检
              </p>
            </div>
            <Link
              to="/cluster/ai-inspect/logs"
              className={navLinkTint(aiInspectLogsActive, "slate")}
            >
              <ScrollText size={20} className={iconTint(aiInspectLogsActive, "slate")} />
              <span>日志查询</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/log-collection"
              className={navLinkTint(aiInspectLogCollectionActive, "emerald")}
            >
              <HardDrive size={20} className={iconTint(aiInspectLogCollectionActive, "emerald")} />
              <span>日志采集</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/monitoring"
              className={navLinkTint(aiInspectMonitoringActive, "slate")}
            >
              <LineChart size={20} className={iconTint(aiInspectMonitoringActive, "slate")} />
              <span>监控中心</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/alerts"
              className={navLinkTint(aiInspectAlertsActive, "slate")}
            >
              <Bell size={20} className={iconTint(aiInspectAlertsActive, "slate")} />
              <span>告警中心</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/reports"
              className={navLinkTint(aiInspectReportsActive, "slate")}
            >
              <ClipboardList size={20} className={iconTint(aiInspectReportsActive, "slate")} />
              <span>巡检报告</span>
            </Link>
            <Link
              to="/cluster/ai-inspect/configure"
              className={navLinkTint(aiInspectConfigureActive, "slate")}
            >
              <Sparkles size={20} className={iconTint(aiInspectConfigureActive, "slate")} />
              <span>巡检配置</span>
            </Link>
          </>
        ) : null}

        {showBaotaNav && isBaota && (
          <Link
            to="/cluster/baota/settings"
            className={navLinkTint(location.pathname === "/cluster/baota/settings", "amber")}
          >
            <Settings
              size={20}
              className={iconTint(location.pathname === "/cluster/baota/settings", "amber")}
            />
            <span>宝塔设置</span>
          </Link>
        )}
      </nav>

      <div className="border-t border-[#E2E8F0] p-6">
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <p className="mb-2 text-xs font-semibold text-gray-900">运行状态</p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${k8sDotClass}`} />
              <span className="text-xs text-gray-600">{k8sStatusLabel}</span>
            </div>
            {showComputeNav ? (
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${pveDotClass}`} />
                <span className="text-xs text-gray-600">{pveStatusLabel}</span>
              </div>
            ) : null}
            {showNetworkNav ? (
              <div className="flex items-center gap-2">
                <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${openWrtDotClass}`} />
                <span className="text-xs text-gray-600">{openWrtStatusLabel}</span>
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${redisDotClass}`} />
              <span
                className="text-xs text-gray-600"
                title={
                  !isViewer && cfg?.redisError
                    ? cfg.redisError
                    : undefined
                }
              >
                {redisStatusLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  statusLoading
                    ? "bg-slate-300"
                    : (authStatus?.mysqlDsnConfigured ?? cfg?.mysqlDsnConfigured)
                      ? (authStatus?.mysqlReachable ?? cfg?.mysqlReachable)
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                      : "bg-amber-500"
                }`}
              />
              <span
                className="text-xs text-gray-600"
                title={
                  (authStatus?.mysqlConnectError ?? cfg?.mysqlConnectError)?.trim() || undefined
                }
              >
                {statusLoading
                  ? "MySQL …"
                  : !(authStatus?.mysqlDsnConfigured ?? cfg?.mysqlDsnConfigured)
                    ? "MySQL 未配置"
                    : (authStatus?.mysqlReachable ?? cfg?.mysqlReachable)
                      ? "MySQL 已连接"
                      : "MySQL 未配置"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  runtimeQ.isLoading
                    ? "bg-slate-300"
                    : !baotaConfigured
                      ? "bg-slate-400"
                      : ok
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                }`}
              />
              <span className="text-xs text-gray-600">
                {runtimeQ.isLoading
                  ? "宝塔 …"
                  : !baotaConfigured
                    ? "宝塔 未配置"
                    : ok
                      ? "宝塔 已连接"
                      : "宝塔 未配置"}
              </span>
            </div>
          </div>
          {cfg && (
            <p className="mt-2 truncate text-[11px] text-gray-500" title={cfg.ddnsHost ? "已连接" : "未配置"}>
              DDNS: {cfg.ddnsHost ? "已连接" : "未配置"}
            </p>
          )}
          {cfg && (
            <p className="text-[11px] text-gray-500">同步间隔: {cfg.syncIntervalSec}s</p>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
