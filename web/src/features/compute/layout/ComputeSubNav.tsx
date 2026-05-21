import React from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Activity,
  Cloud,
  Cpu,
  Database,
  Gauge,
  HardDrive,
  LayoutDashboard,
  Monitor,
  PlugZap,
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
  { to: "/cluster/compute/pve/dashboard", label: "PVE 总览", icon: HardDrive },
  { to: "/cluster/compute/pve/targets", label: "PVE 目标", icon: PlugZap },
  { to: "/cluster/compute/pve/nodes", label: "PVE 节点", icon: Server },
  { to: "/cluster/compute/pve/guests", label: "PVE 虚拟机", icon: Cpu },
  { to: "/cluster/compute/pve/storage", label: "PVE 存储", icon: Database },
  { to: "/cluster/compute/pve/tasks", label: "PVE 任务", icon: Activity },
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

export default ComputeSubNav;
