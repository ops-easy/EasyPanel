import React from "react";
import { Cloud, Gauge, KeyRound, Monitor, PlugZap, ServerCog, ShieldCheck, SlidersHorizontal, SquareTerminal } from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import PveTargetSettingsPanel from "@/features/compute/pve/components/PveTargetSettingsPanel";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";
import { Badge } from "@/shared/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/lib/utils";

type SettingsTab = "access" | "monitoring" | "remote" | "security" | "runtime";

type SettingsSummaryCard = {
  title: string;
  description: string;
  status: string;
  tone: "violet" | "amber" | "sky" | "emerald" | "slate";
  icon: typeof Monitor;
  tab: SettingsTab;
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
  tab,
  actionLabel,
  active,
  onSelect,
}: SettingsSummaryCard & { active: boolean; onSelect: (tab: SettingsTab) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(tab)}
      aria-pressed={active}
      className={cn(
        "group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
        active ? "border-violet-200 ring-1 ring-violet-100" : ""
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

function CompactPanel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Monitor;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="mt-4 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}

const VirtualMachineSettings: React.FC = () => {
  const [activeTab, setActiveTab] = React.useState<SettingsTab>("access");
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
      tab: "runtime",
      actionLabel: "编辑 vCenter 参数",
    },
    {
      title: "PVE 接入",
      description: "Proxmox VE API、虚拟机 / CT、节点、存储和基础电源任务。",
      status: "本页维护",
      tone: "amber",
      icon: PlugZap,
      tab: "access",
      actionLabel: "维护 PVE 目标",
    },
    {
      title: "监控数据源",
      description: "vCenter / PVE / 公有云的 Prometheus 或 VictoriaMetrics vmselect。",
      status: promOk ? "已配置" : "未配置",
      tone: "sky",
      icon: Gauge,
      tab: "monitoring",
      actionLabel: "查看监控配置",
    },
    {
      title: "远程访问",
      description: "vCenter VM 全局 SSH 凭据、控制台脚本、SFTP 和堡垒机入口。",
      status: cfg?.vcenterVmSshGlobalConfigured ? "已配置" : "按需填写",
      tone: "emerald",
      icon: SquareTerminal,
      tab: "remote",
      actionLabel: "查看远程访问",
    },
    {
      title: "VMLog",
      description: "虚拟机日志采集器下载源与 VictoriaLogs 查询链路。",
      status: cfg?.victoriaLogsConfigured ? "已配置" : "可选",
      tone: "slate",
      icon: Cloud,
      tab: "runtime",
      actionLabel: "编辑 VMLog 参数",
    },
  ];

  return (
    <div className="mx-auto w-full space-y-6 pb-12">
      <section className="rounded-xl border border-slate-200 bg-white px-6 py-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Compute Config</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-900">配置</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-500">
              这里是 vCenter、PVE、监控、远程访问和运行参数的统一入口。日常资源入口只展示已接入来源，未接入来源留在接入源里维护。
            </p>
          </div>
          <Badge variant={cfgQ.isLoading ? "outline" : "secondary"}>
            {cfgQ.isLoading ? "读取配置中" : "统一接管入口"}
          </Badge>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as SettingsTab)} className="gap-4">
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          <TabsTrigger value="access">接入源</TabsTrigger>
          <TabsTrigger value="monitoring">监控</TabsTrigger>
          <TabsTrigger value="remote">远程访问</TabsTrigger>
          <TabsTrigger value="security">安全与审计</TabsTrigger>
          <TabsTrigger value="runtime">运行参数</TabsTrigger>
        </TabsList>

        <TabsContent value="access" className="space-y-5">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {cards.map((card) => (
              <StatusCard key={card.title} {...card} active={activeTab === card.tab} onSelect={setActiveTab} />
            ))}
          </section>
          <PveTargetSettingsPanel />
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <CompactPanel icon={Gauge} title="监控数据源">
            <p>
              vCenter、PVE、公有云和 GPU 监控的数据源仍由运行参数统一保存。资源中心只消费这些配置，不在日常导航里拆出单独的 provider 页面。
            </p>
          </CompactPanel>
        </TabsContent>

        <TabsContent value="remote" className="space-y-4">
          <CompactPanel icon={KeyRound} title="远程访问">
            <p>
              控制台、SSH、SFTP 和堡垒机会继续复用现有能力。vCenter VM 的全局 SSH 默认凭据、控制台资源地址和 VMLog 链路在运行参数里维护。
            </p>
          </CompactPanel>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <CompactPanel icon={ShieldCheck} title="安全与审计">
            <p>
              变更操作只允许 admin 或 compute=rw，PVE 和 vCenter 的电源、硬件、快照等动作会继续进入平台审计，便于回溯接管操作。
            </p>
          </CompactPanel>
        </TabsContent>

        <TabsContent value="runtime" className="space-y-4">
          <CompactPanel icon={SlidersHorizontal} title="运行参数">
            <p>保存后写入 MySQL 动态配置并热重载，适合维护 vCenter、监控、控制台、VMLog、SSH 和带外管理参数。</p>
          </CompactPanel>
          <SettingsRuntimeSection variant="virtualMachine" />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default VirtualMachineSettings;
