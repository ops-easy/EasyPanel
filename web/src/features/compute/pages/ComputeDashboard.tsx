import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Cloud, Cpu, Monitor, Server, SquareTerminal } from "lucide-react";
import { Button } from "@/shared/ui/button";

const tiles = [
  {
    title: "vCenter",
    desc: "保留现有虚拟机、宿主机、GPU、控制台与设置能力。",
    to: "/cluster/compute/vcenter/dashboard",
    icon: Monitor,
    tint: "text-violet-700 bg-violet-50 border-violet-100",
  },
  {
    title: "PVE",
    desc: "新增 Proxmox VE 纳管目标、节点、虚拟机与基础电源操作。",
    to: "/cluster/compute/pve/dashboard",
    icon: Server,
    tint: "text-amber-700 bg-amber-50 border-amber-100",
  },
  {
    title: "云主机",
    desc: "继续沿用现有公有云 SSH 登记与终端入口。",
    to: "/cluster/compute/cloud",
    icon: Cloud,
    tint: "text-sky-700 bg-sky-50 border-sky-100",
  },
  {
    title: "堡垒机",
    desc: "统一进入现有会话、凭据、审计与控制台嵌入能力。",
    to: "/cluster/bastion",
    icon: SquareTerminal,
    tint: "text-emerald-700 bg-emerald-50 border-emerald-100",
  },
] as const;

const ComputeDashboard: React.FC = () => {
  return (
    <div className="mx-auto w-full max-w-[min(100%,86rem)] space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">
              虚拟化与主机
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Cpu className="h-6 w-6 text-violet-600" />
              vCenter、PVE、公有云与堡垒机
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              这一层把“运行主机”的能力集中放在一起：vCenter 仍承载现有虚拟化资产，PVE 作为新增平台接入，
              公有云主机与堡垒机按统一入口组织日常操作。
            </p>
          </div>
          <Button asChild className="w-fit gap-2 bg-violet-600 hover:bg-violet-700">
            <Link to="/cluster/compute/pve/dashboard">
              进入 PVE
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ title, desc, to, icon: Icon, tint }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
          >
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-lg border ${tint}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">{title}</h2>
              <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default ComputeDashboard;
