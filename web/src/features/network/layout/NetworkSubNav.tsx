import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Cable, Gauge, LayoutDashboard, Network, RadioTower, Settings, Users, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/cluster/network/dashboard", label: "总览", icon: LayoutDashboard },
  { to: "/cluster/network/devices", label: "设备", icon: Network },
  { to: "/cluster/network/interfaces", label: "接口", icon: Cable },
  { to: "/cluster/network/clients", label: "终端", icon: Users },
  { to: "/cluster/network/wireless", label: "无线", icon: Wifi },
  { to: "/cluster/network/connections", label: "连接", icon: Activity },
  { to: "/cluster/network/monitoring", label: "监控", icon: Gauge },
  { to: "/cluster/network/config", label: "配置", icon: Settings },
] as const;

const legacyActiveMap: Record<string, string> = {
  "/cluster/network/ikuai": "/cluster/network/devices",
  "/cluster/network/ikuai/dashboard": "/cluster/network/devices",
  "/cluster/network/ikuai/interfaces": "/cluster/network/interfaces",
  "/cluster/network/ikuai/clients": "/cluster/network/clients",
  "/cluster/network/ikuai/vm-mapping": "/cluster/network/clients",
  "/cluster/network/ikuai/apps": "/cluster/network/devices",
  "/cluster/network/ikuai/exporter": "/cluster/network/monitoring",
  "/cluster/network/openwrt": "/cluster/network/devices",
  "/cluster/network/openwrt/dashboard": "/cluster/network/devices",
  "/cluster/network/openwrt/interfaces": "/cluster/network/interfaces",
  "/cluster/network/openwrt/clients": "/cluster/network/clients",
  "/cluster/network/openwrt/wireless": "/cluster/network/wireless",
  "/cluster/network/openwrt/connections": "/cluster/network/connections",
  "/cluster/network/openwrt/exporter": "/cluster/network/monitoring",
};

function normalizedPath(pathname: string): string {
  return legacyActiveMap[pathname] ?? pathname;
}

const NetworkSubNav: React.FC = () => {
  const loc = useLocation();
  const path = normalizedPath(loc.pathname);
  return (
    <div className="flex max-w-full flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
      {links.map(({ to, label, icon: Icon }) => {
        const active =
          to === "/cluster/network/dashboard"
            ? path === "/cluster/network" || path === "/cluster/network/dashboard"
            : path === to || path.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex h-9 min-w-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </div>
  );
};

export default NetworkSubNav;
