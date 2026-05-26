import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Cloud,
  Database,
  LayoutDashboard,
  Monitor,
  ScanSearch,
  Server,
  Settings,
  Shield,
} from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useAppConfig } from "@/hooks/use-app-config";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";

type PVETarget = {
  id: string;
};

type ComputeNavLink = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  aliases?: string[];
  resource?: boolean;
};

const resourceLinks: ComputeNavLink[] = [
  {
    to: "/cluster/compute/guests",
    label: "虚拟机 / CT",
    icon: Monitor,
    aliases: ["/cluster/compute/vcenter/vms", "/cluster/compute/pve/guests", "/cluster/vcenter"],
    resource: true,
  },
  {
    to: "/cluster/compute/hosts",
    label: "宿主机 / 节点",
    icon: Server,
    aliases: ["/cluster/compute/vcenter/hosts", "/cluster/compute/pve/nodes", "/cluster/vcenter/hosts"],
    resource: true,
  },
  {
    to: "/cluster/compute/storage",
    label: "存储",
    icon: Database,
    aliases: ["/cluster/compute/pve/storage"],
    resource: true,
  },
  {
    to: "/cluster/compute/activity",
    label: "任务活动",
    icon: Activity,
    aliases: ["/cluster/compute/pve/tasks"],
    resource: true,
  },
];

const utilityLinks: ComputeNavLink[] = [
  { to: "/cluster/compute/cloud", label: "公有云", icon: Cloud },
  { to: "/cluster/compute/bastion", label: "堡垒机", icon: Shield, aliases: ["/cluster/bastion"] },
  { to: "/cluster/compute/tools/ip-scan", label: "IP 扫描", icon: ScanSearch },
  {
    to: "/cluster/compute/config",
    label: "配置",
    icon: Settings,
    aliases: ["/cluster/compute/config", "/cluster/compute/pve/targets"],
  },
];

function activeFor(pathname: string, link: ComputeNavLink): boolean {
  const targets = [link.to, ...(link.aliases ?? [])];
  return targets.some((to) => pathname === to || pathname.startsWith(`${to}/`));
}

const ComputeSubNav: React.FC = () => {
  const loc = useLocation();
  const cfgQ = useAppConfig();
  const { status } = useAuth();
  const canFetchPveTargets = status?.loggedIn === true || status?.authRequired === false;
  const pveTargetsQ = useQuery({
    queryKey: ["pve-targets-compute-subnav"],
    queryFn: ({ signal }) => apiGetJson<{ targets: PVETarget[] }>("/api/pve/targets", { signal }),
    enabled: canFetchPveTargets,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const pveTargetCount = pveTargetsQ.data?.targets?.length ?? 0;
  const providerConfigured = Boolean(cfgQ.data?.vcenterConfigured === true || pveTargetCount > 0);
  const links = useMemo<ComputeNavLink[]>(() => {
    const base: ComputeNavLink[] = [
      {
        to: "/cluster/compute/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        aliases: ["/cluster/compute/vcenter/dashboard", "/cluster/compute/pve/dashboard"],
      },
    ];
    if (providerConfigured) base.push(...resourceLinks);
    base.push(...utilityLinks);
    return base;
  }, [providerConfigured]);

  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1.5">
      {links.map((link) => {
        const active =
          link.to === "/cluster/compute/dashboard"
            ? loc.pathname === "/cluster/compute" || activeFor(loc.pathname, link)
            : activeFor(loc.pathname, link);
        const Icon = link.icon;
        return (
          <Link
            key={link.to}
            to={link.to}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {link.label}
          </Link>
        );
      })}
    </div>
  );
};

export default ComputeSubNav;
