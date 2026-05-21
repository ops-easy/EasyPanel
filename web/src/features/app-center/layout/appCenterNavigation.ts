import {
  Bot,
  Database,
  Globe,
  HardDrive,
  LayoutDashboard,
  Layers,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type AppCenterNavItem = {
  id: "dashboard" | "redis" | "kafka" | "opensearch" | "dns" | "cloudVm" | "openclaw" | "hermes";
  to: string;
  label: string;
  sidebarLabel: string;
  icon: LucideIcon;
};

export const APP_CENTER_NAV_ITEMS: AppCenterNavItem[] = [
  { id: "dashboard", to: "/cluster/apps/dashboard", label: "Dashboard", sidebarLabel: "概览", icon: LayoutDashboard },
  { id: "redis", to: "/cluster/apps/redis", label: "Redis 缓存", sidebarLabel: "Redis", icon: Database },
  { id: "kafka", to: "/cluster/apps/kafka", label: "Kafka", sidebarLabel: "Kafka", icon: Layers },
  { id: "opensearch", to: "/cluster/apps/opensearch", label: "OpenSearch", sidebarLabel: "OpenSearch", icon: Search },
  { id: "dns", to: "/cluster/apps/dns", label: "DNS 管理", sidebarLabel: "DNS 管理", icon: Globe },
  { id: "cloudVm", to: "/cluster/apps/cloud-vm", label: "容器主机", sidebarLabel: "容器主机", icon: HardDrive },
  { id: "openclaw", to: "/cluster/apps/openclaw", label: "OpenClaw", sidebarLabel: "OpenClaw", icon: Bot },
  { id: "hermes", to: "/cluster/apps/hermes", label: "Hermes", sidebarLabel: "Hermes", icon: Sparkles },
];

export const APP_CENTER_MODULE_NAV_ITEMS = APP_CENTER_NAV_ITEMS.filter((item) => item.id !== "dashboard");

export function isAppCenterNavItemActive(pathname: string, item: AppCenterNavItem): boolean {
  if (item.id === "dashboard") {
    return pathname === "/cluster/apps" || pathname === "/cluster/apps/" || pathname === item.to;
  }
  return pathname === item.to || pathname.startsWith(item.to + "/");
}
