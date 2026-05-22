import React from "react";
import { Cloud, Gauge, Monitor, PlugZap, ServerCog, SquareTerminal } from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import PveTargetSettingsPanel from "@/features/compute/pve/components/PveTargetSettingsPanel";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";

type SettingsConfigSection = "vcenter" | "pve" | "monitoring" | "remote" | "vmlog";

type SettingsSummaryCard = {
  title: string;
  description: string;
  status: string;
  tone: "violet" | "amber" | "sky" | "emerald" | "slate";
  icon: typeof Monitor;
  section: SettingsConfigSection;
  actionLabel: string;
};

const toneClass: Record<SettingsSummaryCard["tone"], string> = {
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

function StatusCard({
  title,
  description,
  status,
  tone,
  icon: Icon,
  section,
  actionLabel,
  active,
  onSelect,
}: SettingsSummaryCard & { active: boolean; onSelect: (section: SettingsConfigSection) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(section)}
      aria-pressed={active}
      className={cn(
        "group rounded-xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        active ? "border-violet-300 ring-1 ring-violet-100" : "border-slate-200"
      )}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
          {status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      <p className="mt-3 text-[11px] font-medium text-violet-700 opacity-80 transition group-hover:opacity-100">
        {actionLabel}
      </p>
    </button>
  );
}

const VirtualMachineSettings: React.FC = () => {
  const [activeSection, setActiveSection] = React.useState<SettingsConfigSection>("pve");
  const cfgQ = useAppConfig();
  const cfg = cfgQ.data;
  const promOk =
    cfg?.prometheusVcenterConfigured === true ||
    cfg?.prometheusPveConfigured === true ||
    cfg?.prometheusCloudConfigured === true ||
    cfg?.prometheusConfigured === true;

  const cards: SettingsSummaryCard[] = [
    {
      title: "vCenter 连接",
      description: "vSphere API、控制台资源、宿主机和 vCenter 虚拟机列表。",
      status: cfg?.vcenterConfigured ? "已配置" : "未配置",
      tone: "violet",
      icon: ServerCog,
      section: "vcenter",
      actionLabel: "编辑 vCenter 参数",
    },
    {
      title: "PVE 接入",
      description: "Proxmox VE API、虚拟机 / CT、节点、存储和基础电源任务。",
      status: "本页维护",
      tone: "amber",
      icon: PlugZap,
      section: "pve",
      actionLabel: "维护 PVE 目标",
    },
    {
      title: "监控数据源",
      description: "vCenter / PVE / 公有云的 Prometheus 或 VictoriaMetrics vmselect。",
      status: promOk ? "已配置" : "未配置",
      tone: "sky",
      icon: Gauge,
      section: "monitoring",
      actionLabel: "编辑监控配置",
    },
    {
      title: "远程访问",
      description: "vCenter VM 全局 SSH 凭据、控制台脚本、SFTP 和堡垒机入口。",
      status: cfg?.vcenterVmSshGlobalConfigured ? "已配置" : "按需填写",
      tone: "emerald",
      icon: SquareTerminal,
      section: "remote",
      actionLabel: "编辑远程访问",
    },
    {
      title: "VMLog",
      description: "虚拟机日志采集器下载源与 VictoriaLogs 查询链路。",
      status: cfg?.victoriaLogsConfigured ? "已配置" : "可选",
      tone: "slate",
      icon: Cloud,
      section: "vmlog",
      actionLabel: "编辑 VMLog 参数",
    },
  ];

  const renderActivePanel = () => {
    switch (activeSection) {
      case "vcenter":
        return <SettingsRuntimeSection variant="virtualMachine" focus="vcenter" />;
      case "monitoring":
        return <SettingsRuntimeSection variant="virtualMachine" focus="monitoring" />;
      case "remote":
        return <SettingsRuntimeSection variant="virtualMachine" focus="remote" />;
      case "vmlog":
        return <SettingsRuntimeSection variant="virtualMachine" focus="vmlog" />;
      case "pve":
      default:
        return <PveTargetSettingsPanel />;
    }
  };

  return (
    <div className="mx-auto w-full space-y-6 pb-12">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compute Config</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">配置</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-500">
              这里是 vCenter、PVE、监控、远程访问和 VMLog 的统一入口。点上方卡片，下面直接维护对应配置。
            </p>
          </div>
          <Badge variant={cfgQ.isLoading ? "outline" : "secondary"}>
            {cfgQ.isLoading ? "读取配置中" : "统一接管入口"}
          </Badge>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <StatusCard
            key={card.section}
            {...card}
            active={activeSection === card.section}
            onSelect={setActiveSection}
          />
        ))}
      </section>

      {renderActivePanel()}
    </div>
  );
};

export default VirtualMachineSettings;
