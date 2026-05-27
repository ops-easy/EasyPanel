import React from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronRight, LayoutDashboard, Sparkles } from "lucide-react";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { OpenClawChatMarkdown } from "@/features/app-center/openclaw/components/OpenClawChatMarkdown";
import { cn } from "@/lib/utils";
import {
  AI_INSPECT_NAV_ITEMS_BY_ID,
  OBSERVABILITY_INSPECT_WORKSPACE_LABEL,
  type AiInspectNavItem,
} from "@/features/ops/ai-inspect/aiInspectNavigation";
import { AccessHealthMatrix, type AccessHealthItem } from "@/features/ops/ai-inspect/components/AccessHealthMatrix";
import { CurrentRiskPanel } from "@/features/ops/ai-inspect/components/CurrentRiskPanel";
import { NextStepPanel, type NextStepAction } from "@/features/ops/ai-inspect/components/NextStepPanel";
import { OPS_MONITORING_PRESETS } from "./opsMonitoringPresets";
import { toast } from "sonner";

type AlertsGet = {
  rules: { enabled: boolean }[];
  channels: unknown[];
};

type AIProviderGet = {
  endpoint: { enabled: boolean; provider?: string; baseUrl: string; apiKeySet: boolean; model: string };
};

function SummaryCard(props: {
  item: AiInspectNavItem;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = props.item.icon;
  return (
    <Link
      to={props.item.to}
      className={cn(
        "group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md",
        props.className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-900">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-slate-700">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <h2 className="text-base font-semibold">{props.item.label}</h2>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
      <div className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{props.children}</div>
    </Link>
  );
}

/** 观测与巡检工作区总览：数据接入、风险与排障动作的状态枢纽 */
const AiInspectDashboard: React.FC = () => {
  const qc = useQueryClient();
  const { status } = useAuth();
  const isAdmin = status?.role === "admin";
  const loggedIn = Boolean(status?.loggedIn);

  const promStatusQ = useQuery({
    queryKey: ["prometheus-status"],
    queryFn: ({ signal }) =>
      apiGetJson<{ scopes?: { k8s?: { configured?: boolean }; vcenter?: { configured?: boolean } } }>(
        "/api/prometheus/status"
      , { signal }),
    enabled: loggedIn,
  });
  const monitoringPanelsQ = useQuery({
    queryKey: ["ops-monitoring-panels"],
    queryFn: ({ signal }) => apiGetJson<{ panels: { id: string }[] }>("/api/ops/monitoring/panels", { signal }),
    enabled: loggedIn,
  });
  const alertsQ = useQuery({
    queryKey: ["ops-alerts"],
    queryFn: ({ signal }) => apiGetJson<AlertsGet>("/api/ops/alerts", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const openclawQ = useQuery({
    queryKey: ["ops-ai-provider"],
    queryFn: ({ signal }) => apiGetJson<AIProviderGet>("/api/ops/ai-provider", { signal }),
    enabled: loggedIn && isAdmin,
  });
  const repQ = useQuery({
    queryKey: ["ops-inspect-reports-head"],
    queryFn: ({ signal }) =>
      apiGetJson<{ reports?: unknown[]; total?: number }>("/api/ops/inspect/reports?limit=1&offset=0", { signal }),
    enabled: loggedIn && isAdmin,
  });

  const clusterAdvisoryQ = useQuery({
    queryKey: ["ops-cluster-advisory"],
    queryFn: ({ signal }) =>
      apiGetJson<{
        ok?: boolean;
        updatedAt?: string;
        rating?: string;
        markdown?: string;
        runError?: string;
        acknowledged?: boolean;
        bellActive?: boolean;
        prometheusConfigured?: boolean;
        logPodsSampled?: number;
      }>("/api/ops/cluster-advisory", { signal }),
    enabled: loggedIn,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const advisoryAckMut = useMutation({
    mutationFn: () => apiPostJson("/api/ops/cluster-advisory/ack", {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ops-cluster-advisory"] }),
  });

  const advisoryRunMut = useMutation({
    mutationFn: () => apiPostJson<{ ok?: boolean; message?: string }>("/api/ops/cluster-advisory/run", {}),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["ops-cluster-advisory"] });
      toast.message(r?.message || "已排队后台分析");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const customPanelN = monitoringPanelsQ.data?.panels?.length ?? 0;
  const presetN = OPS_MONITORING_PRESETS.length;

  const rulesOn = alertsQ.data?.rules?.filter((r) => r.enabled).length ?? 0;
  const rulesTotal = alertsQ.data?.rules?.length ?? 0;
  const chCount = alertsQ.data?.channels?.length ?? 0;

  const oc = openclawQ.data?.endpoint;
  const repN = repQ.data?.total ?? repQ.data?.reports?.length ?? 0;
  const navItems = AI_INSPECT_NAV_ITEMS_BY_ID;
  const k8sPrometheusConfigured = promStatusQ.data?.scopes?.k8s?.configured === true;
  const vcenterPrometheusConfigured = promStatusQ.data?.scopes?.vcenter?.configured === true;
  const aiProviderReady = Boolean(oc?.enabled && (oc.apiKeySet || oc.baseUrl));
  const accessHealthItems: AccessHealthItem[] = [
    {
      label: "Kubernetes 指标",
      scope: "Prometheus / k8s",
      status: promStatusQ.isLoading ? "unknown" : k8sPrometheusConfigured ? "ok" : "missing",
      detail: k8sPrometheusConfigured ? "监控看板和告警规则可直接查询 K8s 指标。" : "先在集群设置中配置 Kubernetes Prometheus 地址。",
      to: navItems.monitoring.to,
    },
    {
      label: "vCenter 指标",
      scope: "Prometheus / vcenter",
      status: promStatusQ.isLoading ? "unknown" : vcenterPrometheusConfigured ? "ok" : "missing",
      detail: vcenterPrometheusConfigured ? "VMware 指标可用于虚拟化看板与巡检报告。" : "未接入时，vCenter 监控和关联告警会缺少数据。",
      to: navItems.monitoring.to,
    },
    {
      label: "PVE 指标",
      scope: "Prometheus / PVE",
      status: "unknown",
      detail: "跟随巡检策略中的 PVE / Proxmox VE 开关与运行时数据源配置。",
      to: navItems.configure.to,
    },
    {
      label: "Network 指标",
      scope: "Prometheus / 网络设备",
      status: "unknown",
      detail: "OpenWrt / iKuai 指标纳入网络设备巡检，适合和流量告警联动。",
      to: navItems.configure.to,
    },
    {
      label: "日志检索",
      scope: "VictoriaLogs",
      status: clusterAdvisoryQ.data?.logPodsSampled ? "ok" : "unknown",
      detail: "日志接入和检索分开维护，告警排障可直接跳到日志检索页。",
      to: navItems.logs.to,
    },
    {
      label: "AI Provider",
      scope: oc?.provider || "OpenAI compatible",
      status: openclawQ.isLoading ? "unknown" : aiProviderReady ? "ok" : "missing",
      detail: aiProviderReady ? "巡检摘要、日志智能分析和控制面建议可复用同一 Provider。" : "未启用时仍可采集报告，但不会生成大模型摘要。",
      to: navItems.configure.to,
    },
  ];
  const nextStepActions: NextStepAction[] = [
    { item: navItems.monitoring, note: "确认 K8s / vCenter 指标曲线和自定义 PromQL 是否正常。" },
    { item: navItems.alerts, note: "维护 PromQL 告警规则，并从告警跳到监控或日志排障。", adminOnly: true },
    { item: navItems.logs, note: "查看 VictoriaLogs 连接状态、错误趋势和单条 AI 分析。" },
    { item: navItems.reports, note: "阅读平台巡检、Pod 重启和工作负载建议报告。" },
    { item: navItems.logCollection, note: "为虚拟机或宝塔主机安装 Vector 采集器。" },
    { item: navItems.configure, note: "调整 AI Provider、巡检范围和每日自动报告。", adminOnly: true },
  ];

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-slate-50/80 px-6 py-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-cyan-900/80">{OBSERVABILITY_INSPECT_WORKSPACE_LABEL} · 总览</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <LayoutDashboard className="h-7 w-7 text-cyan-600" />
          观测与巡检总览
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          按运维工作流串起<strong>监控看板</strong>、<strong>告警与通知</strong>、<strong>日志检索</strong>和<strong>巡检报告</strong>；需要接入采集器或调整定时任务时，再进入接入与设置。
        </p>
        {isAdmin ? (
          <Button type="button" variant="outline" size="sm" className="mt-4 border-cyan-200 bg-white/90" asChild>
            <Link to={navItems.configure.to} className="gap-1.5">
              <Sparkles className="h-4 w-4" />
              打开巡检策略
            </Link>
          </Button>
        ) : null}
      </div>

      <AccessHealthMatrix items={accessHealthItems} />

      <CurrentRiskPanel
        rating={clusterAdvisoryQ.data?.rating}
        updatedAt={clusterAdvisoryQ.data?.updatedAt}
        bellActive={clusterAdvisoryQ.data?.bellActive}
        reportCount={repN}
        enabledAlertRules={rulesOn}
      >
      <Card
        className={cn(
          "border-slate-200/90 shadow-sm",
          clusterAdvisoryQ.data?.bellActive && "border-rose-300/90 bg-rose-50/40"
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {clusterAdvisoryQ.data?.bellActive ? (
                  <Bell className="h-5 w-5 text-rose-600" aria-hidden />
                ) : (
                  <Sparkles className="h-5 w-5 text-cyan-600" aria-hidden />
                )}
                AI 建议 · kube-system 控制平面
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                约每 30 分钟后台汇总 apiserver / etcd / scheduler / controller / coredns 等日志，并结合集群 Pod 计数与 Prometheus
                是否接入，由已配置的 AI Provider 给出评级与处置建议。处理完成后请点击「已处理」；若评级为 critical，顶栏铃铛会持续提示直至在「通知」中确认。
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {isAdmin ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={advisoryRunMut.isPending}
                  onClick={() => void advisoryRunMut.mutateAsync()}
                >
                  立即触发分析
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8"
                disabled={advisoryAckMut.isPending || clusterAdvisoryQ.data?.acknowledged}
                onClick={() => void advisoryAckMut.mutateAsync()}
              >
                已处理（挂起至下次异常）
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            {clusterAdvisoryQ.data?.updatedAt ? (
              <span className="font-mono">更新 {clusterAdvisoryQ.data.updatedAt}</span>
            ) : (
              <span>尚无后台结果（首次约启动后 45s～30min）</span>
            )}
            {clusterAdvisoryQ.data?.rating ? (
              <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-semibold uppercase">
                评级 {clusterAdvisoryQ.data.rating}
              </span>
            ) : null}
            {clusterAdvisoryQ.data?.prometheusConfigured != null ? (
              <span>Prometheus：{clusterAdvisoryQ.data.prometheusConfigured ? "已配置" : "未配置"}</span>
            ) : null}
            {clusterAdvisoryQ.data?.logPodsSampled != null ? (
              <span>采样 Pod 日志 {clusterAdvisoryQ.data.logPodsSampled}</span>
            ) : null}
            {clusterAdvisoryQ.data?.acknowledged ? <span className="text-emerald-700">你已确认当前建议</span> : null}
          </div>
          {clusterAdvisoryQ.data?.runError ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{clusterAdvisoryQ.data.runError}</p>
          ) : null}
          {clusterAdvisoryQ.data?.markdown ? (
            <div className="max-h-[min(60vh,520px)] overflow-y-auto rounded-lg border border-slate-200 bg-white/95 px-3 py-3 text-[13px] leading-relaxed">
              <OpenClawChatMarkdown source={clusterAdvisoryQ.data.markdown} />
            </div>
          ) : !clusterAdvisoryQ.data?.runError ? (
            <p className="text-xs text-slate-500">等待后台首次分析或检查 AI Provider 是否启用。</p>
          ) : null}
        </CardContent>
      </Card>
      </CurrentRiskPanel>

      <NextStepPanel actions={nextStepActions} isAdmin={isAdmin} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SummaryCard item={navItems.monitoring}>
          {promStatusQ.isLoading || monitoringPanelsQ.isLoading ? (
            <span className="text-slate-400">加载中…</span>
          ) : (
            <>
              <p>使用已配置的 Prometheus / vmselect 执行 PromQL 并绘图；内置 {presetN} 个常用模板，不依赖 Grafana 同步。</p>
              <p className="mt-2">
                管理员自定义图：<strong className="text-slate-800">{customPanelN}</strong> 条
              </p>
              <p className="mt-2 text-xs text-slate-500">
                K8s 数据源 {promStatusQ.data?.scopes?.k8s?.configured ? "已配置" : "未配置"} · vCenter{" "}
                {promStatusQ.data?.scopes?.vcenter?.configured ? "已配置" : "未配置"}
              </p>
            </>
          )}
        </SummaryCard>

        <SummaryCard item={navItems.alerts}>
          {!isAdmin ? (
            <p>告警规则与通知通道的配置、评估日志仅<strong>管理员</strong>可见；你可进入页面查看说明或联系管理员开通。</p>
          ) : alertsQ.isLoading ? (
            <span className="text-slate-400">加载中…</span>
          ) : (
            <>
              <p>
                告警规则：<strong className="text-slate-800">{rulesOn}</strong> 条启用 / 共 {rulesTotal} 条
              </p>
              <p className="mt-2">
                通知通道：<strong className="text-slate-800">{chCount}</strong> 个
              </p>
              <p className="mt-2 text-xs text-slate-500">Prometheus 规则评估与企业微信 / SMTP 等在此维护。</p>
            </>
          )}
        </SummaryCard>

        <SummaryCard item={navItems.logs}>
          <p>
            对接 VictoriaLogs（Helm 部署的 VMLog）：查看连接状态、集群内 Service 探测，以及按菜单分类的采集说明与 LogsQL 查询。
          </p>
          <p className="mt-2 text-xs text-slate-500">在「集群设置 → 日志」配置地址与命名空间内 Service 发现。</p>
        </SummaryCard>

        <SummaryCard item={navItems.reports}>
          {!isAdmin ? (
            <p>
              平台巡检历史、Pod / 工作负载重启 AI、集群 rollup 与关联分析等汇总入口；<strong>管理员</strong>可查看平台级列表，非只读用户可查看
              K8s 类报告。
            </p>
          ) : repQ.isLoading ? (
            <span className="text-slate-400">加载中…</span>
          ) : (
            <>
              <p>
                平台巡检已存报告：<strong className="text-slate-800">{repN}</strong> 条；支持分类浏览、Markdown / JSON 高亮与一键复制。
              </p>
              <p className="mt-2 text-xs text-slate-500">原「重启 AI 分析报告」路径已合并到本页。</p>
            </>
          )}
        </SummaryCard>

        <SummaryCard item={navItems.logCollection}>
          <p>
            虚拟机 / 宝塔主机安装 Vector，将文本日志推送到 VictoriaLogs；生成脚本、后台 SSH 安装与进度回传。可在运行时配置自有域名下载源。
          </p>
          <p className="mt-2 text-xs text-slate-500">与「日志检索」分工：本页负责采集器，检索页负责 VL 可视化与趋势。</p>
        </SummaryCard>

        <SummaryCard item={navItems.configure}>
          {!isAdmin ? (
            <p>
              AI Provider 与定时巡检、模型与巡检范围仅管理员可配。请使用左侧<strong>监控看板</strong>查看 Prometheus 监控图。
            </p>
          ) : openclawQ.isLoading ? (
            <span className="text-slate-400">加载中…</span>
          ) : (
            <>
              <p>
                大模型巡检：
                <strong className="text-slate-800">{oc?.enabled ? "已启用" : "未启用"}</strong>
                {oc?.apiKeySet ? " · 已配置 API Key" : ""}
              </p>
              {oc?.baseUrl ? (
                <p className="mt-2 break-all font-mono text-xs text-slate-700">Base：{oc.baseUrl}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">尚未填写 Base URL 或未选用应用中心实例。</p>
              )}
              {oc?.model ? (
                <p className="mt-1 text-xs text-slate-600">模型：{oc.model}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">历史报告条目：{repN}（完整列表见「巡检报告」）</p>
            </>
          )}
        </SummaryCard>
      </div>
    </div>
  );
};

export default AiInspectDashboard;
