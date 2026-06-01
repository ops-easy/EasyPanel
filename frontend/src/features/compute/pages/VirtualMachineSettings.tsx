import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Cloud, Gauge, Monitor, PlugZap, ServerCog, ShieldCheck } from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import PveTargetSettingsPanel from "@/features/compute/pve/components/PveTargetSettingsPanel";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";
import ComputePageHeader from "@/features/compute/components/ComputePageHeader";
import ComputeStatusBadge from "@/features/compute/components/ComputeStatusBadge";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ComputeHealth, ComputeProvider } from "@/features/compute/components/compute-resource-types";

type SettingsConfigSection = "vcenter" | "pve" | "monitoring" | "idrac" | "vmlog";

type SettingsSummaryCard = {
  title: string;
  description: string;
  status: string;
  health: ComputeHealth;
  tone: "violet" | "amber" | "sky" | "emerald" | "slate";
  icon: typeof Monitor;
  section: SettingsConfigSection;
  actionLabel: string;
};

type ComputeProvidersResponse = {
  providers?: ComputeProvider[];
  warnings?: string[];
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
  health,
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
        "group rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        active ? "border-violet-300 ring-1 ring-violet-100" : "border-slate-200"
      )}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${toneClass[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        <ComputeStatusBadge statusLabel={status} health={health} />
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
  const providersQ = useQuery({
    queryKey: ["compute-config-providers"],
    queryFn: ({ signal }) => apiGetJson<ComputeProvidersResponse>("/api/compute/providers", { signal }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const cfg = cfgQ.data;
  const providers = providersQ.data?.providers ?? [];
  const providerStatus = (providerKey: "vcenter" | "pve", fallbackConfigured = false) => {
    if (providersQ.isLoading) return { label: "读取中", health: "unknown" as ComputeHealth };
    const provider = providers.find((item) => item.provider === providerKey);
    const configured = provider?.configured === true || fallbackConfigured;
    if (!configured) return { label: "未配置", health: "unknown" as ComputeHealth };
    if (provider?.healthy === false) return { label: "需检查", health: "warning" as ComputeHealth };
    return { label: "已配置", health: "ok" as ComputeHealth };
  };
  const vcenterStatus = providerStatus("vcenter", cfg?.vcenterConfigured === true);
  const pveStatus = providerStatus("pve");
  const promOk =
    cfg?.prometheusVcenterConfigured === true ||
    cfg?.prometheusPveConfigured === true ||
    cfg?.prometheusCloudConfigured === true ||
    cfg?.prometheusConfigured === true;

  const cards: SettingsSummaryCard[] = [
    {
      title: "vCenter 连接",
      description: "vSphere API、控制台资源、宿主机和 vCenter 虚拟机列表。",
      status: vcenterStatus.label,
      health: vcenterStatus.health,
      tone: "violet",
      icon: ServerCog,
      section: "vcenter",
      actionLabel: "编辑 vCenter 参数",
    },
    {
      title: "PVE 目标",
      description: "Proxmox VE API、虚拟机 / CT、节点、存储和基础电源任务。",
      status: pveStatus.label,
      health: pveStatus.health,
      tone: "amber",
      icon: PlugZap,
      section: "pve",
      actionLabel: "维护 PVE 目标",
    },
    {
      title: "监控数据源",
      description: "vCenter / PVE / 公有云的 Prometheus 或 VictoriaMetrics vmselect。",
      status: promOk ? "已配置" : "未配置",
      health: promOk ? "ok" : "unknown",
      tone: "sky",
      icon: Gauge,
      section: "monitoring",
      actionLabel: "编辑监控配置",
    },
    {
      title: "iDRAC 配置",
      description: "宿主机带外 Redfish 配置，多台 iDRAC 目标统一维护。",
      status: "可选",
      health: "idle",
      tone: "emerald",
      icon: ShieldCheck,
      section: "idrac",
      actionLabel: "维护 iDRAC 目标",
    },
    {
      title: "VMLog",
      description: "虚拟机日志采集器下载源与 VictoriaLogs 查询链路。",
      status: cfg?.victoriaLogsConfigured ? "已配置" : "可选",
      health: cfg?.victoriaLogsConfigured ? "ok" : "idle",
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
      case "idrac":
        return <SettingsRuntimeSection variant="virtualMachine" focus="idrac" />;
      case "vmlog":
        return <SettingsRuntimeSection variant="virtualMachine" focus="vmlog" />;
      case "pve":
      default:
        return <PveTargetSettingsPanel />;
    }
  };

  return (
    <div className="mx-auto w-full space-y-6 pb-12">
      <ComputePageHeader
        eyebrow="Compute Config"
        title="配置"
        description="这里是 vCenter、PVE、监控、iDRAC 和 VMLog 的统一入口。上方配置源状态来自统一资源模型，下面直接维护对应配置。"
        refreshing={cfgQ.isLoading || providersQ.isFetching}
        onRefresh={() => {
          void cfgQ.refetch();
          void providersQ.refetch();
        }}
      />

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
