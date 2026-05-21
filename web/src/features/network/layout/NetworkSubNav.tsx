import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, Cable, Gauge, LayoutDashboard, RadioTower, Router, Users, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/cluster/network/dashboard", label: "总览", icon: LayoutDashboard },
  { to: "/cluster/network/ikuai/dashboard", label: "iKuai 总览", icon: Router },
  { to: "/cluster/network/ikuai/interfaces", label: "iKuai 接口", icon: Cable },
  { to: "/cluster/network/ikuai/clients", label: "iKuai 客户端", icon: Users },
  { to: "/cluster/network/openwrt/dashboard", label: "OpenWrt", icon: Wifi },
  { to: "/cluster/network/openwrt/interfaces", label: "OpenWrt 接口", icon: RadioTower },
  { to: "/cluster/network/openwrt/clients", label: "OpenWrt 客户端", icon: Users },
  { to: "/cluster/network/openwrt/connections", label: "连接跟踪", icon: Activity },
  { to: "/cluster/network/openwrt/wireless", label: "OpenWrt 无线", icon: Wifi },
  { to: "/cluster/network/openwrt/exporter", label: "数据源", icon: Gauge },
] as const;

const NetworkSubNav: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
      {links.map(({ to, label, icon: Icon }) => {
        const active =
          to === "/cluster/network/dashboard"
            ? loc.pathname === "/cluster/network" || loc.pathname === "/cluster/network/dashboard"
            : loc.pathname === to || loc.pathname.startsWith(to + "/");
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </div>
  );
};

export default NetworkSubNav;
