import type { LucideIcon } from "lucide-react";
import { Bell, ClipboardList, Gauge, HardDrive, LayoutDashboard, ScrollText, Settings2 } from "lucide-react";

export type AiInspectNavTint = "slate" | "emerald";

export type AiInspectNavItemId =
  | "dashboard"
  | "monitoring"
  | "alerts"
  | "logs"
  | "reports"
  | "logCollection"
  | "configure";

export type AiInspectNavItem = {
  id: AiInspectNavItemId;
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  tint: AiInspectNavTint;
};

export type AiInspectNavGroup = {
  id: "overview" | "detect" | "output" | "setup";
  label: string;
  items: AiInspectNavItem[];
};

export const OBSERVABILITY_INSPECT_WORKSPACE_LABEL = "观测与巡检";

export const AI_INSPECT_NAV_GROUPS: AiInspectNavGroup[] = [
  {
    id: "overview",
    label: "总览",
    items: [
      {
        id: "dashboard",
        to: "/cluster/ai-inspect/dashboard",
        label: "观测与巡检总览",
        description: "查看数据源、监控、告警、日志、报告与 AI 建议的综合状态。",
        icon: LayoutDashboard,
        tint: "slate",
      },
    ],
  },
  {
    id: "detect",
    label: "发现与定位",
    items: [
      {
        id: "monitoring",
        to: "/cluster/ai-inspect/monitoring",
        label: "监控看板",
        description: "查看 Prometheus / vmselect 指标图和自定义 PromQL 面板。",
        icon: Gauge,
        tint: "slate",
      },
      {
        id: "alerts",
        to: "/cluster/ai-inspect/alerts",
        label: "告警与通知",
        description: "维护告警规则、通知通道、Alertmanager Webhook 与评估日志。",
        icon: Bell,
        tint: "slate",
      },
      {
        id: "logs",
        to: "/cluster/ai-inspect/logs",
        label: "日志检索",
        description: "检索 VictoriaLogs 日志，查看错误信号、趋势和单条 AI 分析。",
        icon: ScrollText,
        tint: "slate",
      },
    ],
  },
  {
    id: "output",
    label: "巡检输出",
    items: [
      {
        id: "reports",
        to: "/cluster/ai-inspect/reports",
        label: "巡检报告",
        description: "浏览平台巡检、Pod 重启 AI、集群 rollup 与工作负载建议报告。",
        icon: ClipboardList,
        tint: "slate",
      },
    ],
  },
  {
    id: "setup",
    label: "接入与设置",
    items: [
      {
        id: "logCollection",
        to: "/cluster/ai-inspect/log-collection",
        label: "日志接入",
        description: "为虚拟机或宝塔主机生成 Vector 采集脚本并下发安装任务。",
        icon: HardDrive,
        tint: "emerald",
      },
      {
        id: "configure",
        to: "/cluster/ai-inspect/configure",
        label: "巡检策略",
        description: "配置 AI Provider、巡检范围、定时报表和立即执行任务。",
        icon: Settings2,
        tint: "slate",
      },
    ],
  },
];

export const AI_INSPECT_NAV_ITEMS = AI_INSPECT_NAV_GROUPS.flatMap((group) => group.items);

export const AI_INSPECT_NAV_ITEMS_BY_ID = Object.fromEntries(
  AI_INSPECT_NAV_ITEMS.map((item) => [item.id, item])
) as Record<AiInspectNavItemId, AiInspectNavItem>;

export function isAiInspectNavItemActive(item: AiInspectNavItem, pathname: string): boolean {
  switch (item.id) {
    case "dashboard":
      return (
        pathname === "/cluster/ai-inspect" ||
        pathname === "/cluster/ai-inspect/" ||
        pathname === "/cluster/ai-inspect/dashboard"
      );
    case "logs":
      return pathname === "/cluster/ai-inspect/logs" || pathname.startsWith("/cluster/ai-inspect/logs/");
    case "logCollection":
      return pathname === "/cluster/ai-inspect/log-collection" || pathname.startsWith("/cluster/ai-inspect/log-collection/");
    default:
      return pathname === item.to || pathname.startsWith(`${item.to}/`);
  }
}
