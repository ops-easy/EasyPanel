import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Cloud,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Monitor,
  ScanSearch,
  Server,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/cluster/compute/dashboard", label: "总览", icon: LayoutDashboard },
  { to: "/cluster/compute/vcenter/vms", label: "vCenter / 虚拟机", icon: Monitor },
  { to: "/cluster/compute/vcenter/hosts", label: "vCenter / 宿主机", icon: Server },
  { to: "/cluster/compute/vcenter/gpu", label: "GPU 监控", icon: Gauge },
  { to: "/cluster/compute/pve/dashboard", label: "PVE", icon: HardDrive },
  { to: "/cluster/compute/cloud", label: "云主机", icon: Cloud },
  { to: "/cluster/compute/bastion", label: "堡垒机", icon: Shield },
  { to: "/cluster/compute/tools/ip-scan", label: "IP 扫描", icon: ScanSearch },
] as const;

const ComputeSubNav: React.FC = () => {
  const loc = useLocation();
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
      {links.map(({ to, label, icon: Icon }) => {
        const active =
          to === "/cluster/compute/dashboard"
            ? loc.pathname === "/cluster/compute" || loc.pathname === "/cluster/compute/dashboard"
            : loc.pathname === to || loc.pathname.startsWith(to + "/") || (to.includes("/pve/") && loc.pathname.startsWith("/cluster/compute/pve"));
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

export default ComputeSubNav;
