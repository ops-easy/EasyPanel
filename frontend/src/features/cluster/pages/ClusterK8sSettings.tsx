import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Cable,
  Layers3,
  ListTree,
  MonitorCog,
  PackageCheck,
  ScrollText,
} from "lucide-react";
import { APP_CONFIG_QUERY_KEY } from "@/hooks/use-app-config";
import { apiGetJson, type AppConfig } from "@/lib/api";
import ClusterK8sAddonsSection from "@/features/cluster/pages/ClusterK8sAddonsSection";
import ClusterK8sDashboardMonitoringSection from "@/features/cluster/pages/ClusterK8sDashboardMonitoringSection";
import ClusterK8sKubePrometheusStackSection from "@/features/cluster/pages/ClusterK8sKubePrometheusStackSection";
import ClusterK8sVmLogSection from "@/features/cluster/pages/ClusterK8sVmLogSection";
import SettingsPrometheusSection from "@/features/settings/components/SettingsPrometheusSection";
import SettingsRuntimeSection from "@/features/settings/components/SettingsRuntimeSection";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

type AddonsStatusResponse = {
  checkedAt?: string;
  ingressNginx?: {
    installed?: boolean;
    likelyInstalled?: boolean;
    controllersLikelyReady?: boolean;
    podReady?: number;
    podTotal?: number;
  };
  kubePrometheusStack?: {
    installed?: boolean;
    namespaceExists?: boolean;
    prometheusReady?: boolean;
    runtimePrometheusURLSyncRecommended?: boolean;
    runtimePrometheusURLSyncTarget?: string;
    prometheusMetricsProbe?: {
      ok?: boolean;
      skipped?: boolean;
      detail?: string;
    };
  };
};

const SETTINGS_TABS = [
  { value: "overview", label: "总览", icon: Activity },
  { value: "connection", label: "集群连接", icon: Cable },
  { value: "ingress", label: "入口控制器", icon: Layers3 },
  { value: "monitoring", label: "监控", icon: MonitorCog },
  { value: "logs", label: "日志", icon: ScrollText },
  { value: "harbor", label: "镜像仓库", icon: PackageCheck },
  { value: "advanced", label: "高级", icon: ListTree },
] as const;

type SettingsTabValue = (typeof SETTINGS_TABS)[number]["value"];
type StatusTone = "ok" | "warn" | "idle" | "loading";

function isSettingsTab(value: string | null): value is SettingsTabValue {
  return SETTINGS_TABS.some((tab) => tab.value === value);
}

function StatusTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: StatusTone;
}) {
  const toneClass: Record<StatusTone, string> = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
    idle: "border-slate-200 bg-slate-50 text-slate-600",
    loading: "border-sky-200 bg-sky-50 text-sky-800",
  };

  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-500">{label}</span>
        <Badge variant="outline" className={toneClass[tone]}>
          {value}
        </Badge>
      </div>
      {detail ? (
        <p className="mt-1 truncate font-mono text-[11px] text-slate-500" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function SettingsStatusStrip({
  config,
  addons,
  configLoading,
  addonsLoading,
}: {
  config?: AppConfig;
  addons?: AddonsStatusResponse;
  configLoading: boolean;
  addonsLoading: boolean;
}) {
  const ingress = addons?.ingressNginx;
  const ingressInstalled = Boolean(ingress?.installed || ingress?.likelyInstalled);
  const prometheusStack = addons?.kubePrometheusStack;
  const promStackReady = Boolean(prometheusStack?.installed);
  const promStackPending = Boolean(prometheusStack?.namespaceExists && !prometheusStack?.installed);
  const monitoringReady = Boolean(
    config?.prometheusK8sConfigured ||
      config?.prometheusUrlK8sHint ||
      config?.vmSelectUrlK8sHint ||
      config?.prometheusConfigured
  );
  const monitoringNeedsSync = Boolean(prometheusStack?.runtimePrometheusURLSyncRecommended);
  const monitoringProbeFailed = Boolean(
    prometheusStack?.prometheusMetricsProbe &&
      !prometheusStack.prometheusMetricsProbe.skipped &&
      prometheusStack.prometheusMetricsProbe.ok === false
  );
  const monitoringProblem = monitoringNeedsSync || monitoringProbeFailed;
  const vmLogReady = Boolean(config?.victoriaLogsConfigured || config?.victoriaLogsUrlHint);
  const harborReady = Boolean(config?.harborConfigured || config?.harborUrlHint);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <StatusTile
        label="K8s 连接"
        value={configLoading ? "读取中" : config?.k8sConfigured ? "已连接" : "未连接"}
        detail={config?.k8sConfigured ? "Kubernetes API 可用" : "需要保存连接方式"}
        tone={configLoading ? "loading" : config?.k8sConfigured ? "ok" : "warn"}
      />
      <StatusTile
        label="Ingress"
        value={addonsLoading ? "检测中" : ingressInstalled ? "已安装" : "未检测到"}
        detail={
          ingress?.controllersLikelyReady
            ? `Pod ${ingress.podReady ?? 0}/${ingress.podTotal ?? 0}`
            : addons?.checkedAt
              ? `更新于 ${addons.checkedAt}`
              : undefined
        }
        tone={addonsLoading ? "loading" : ingressInstalled ? "ok" : "idle"}
      />
      <StatusTile
        label="Prometheus 栈"
        value={addonsLoading ? "检测中" : promStackReady ? "已就绪" : promStackPending ? "部署中" : "未安装"}
        detail={prometheusStack?.prometheusReady ? "Prometheus Ready" : "kube-prometheus-stack"}
        tone={addonsLoading ? "loading" : promStackReady ? "ok" : promStackPending ? "warn" : "idle"}
      />
      <StatusTile
        label="监控数据源"
        value={configLoading ? "读取中" : monitoringProblem ? "需处理" : monitoringReady ? "已配置" : "未配置"}
        detail={
          monitoringNeedsSync
            ? `需同步到 ${prometheusStack?.runtimePrometheusURLSyncTarget ?? "发现地址"}`
            : config?.vmSelectUrlK8sHint || config?.prometheusUrlK8sHint || config?.prometheusUrlHint
        }
        tone={configLoading ? "loading" : monitoringProblem ? "warn" : monitoringReady ? "ok" : "warn"}
      />
      <StatusTile
        label="VMLog"
        value={configLoading ? "读取中" : vmLogReady ? "已配置" : "未配置"}
        detail={config?.victoriaLogsUrlHint}
        tone={configLoading ? "loading" : vmLogReady ? "ok" : "idle"}
      />
      <StatusTile
        label="Harbor"
        value={configLoading ? "读取中" : harborReady ? "已配置" : "未配置"}
        detail={config?.harborUrlHint || config?.harborRegistryHost}
        tone={configLoading ? "loading" : harborReady ? "ok" : "idle"}
      />
    </div>
  );
}

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1.5 border-l-2 border-slate-200 py-1 pl-4">
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

const ClusterK8sSettings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: SettingsTabValue = isSettingsTab(tabParam) ? tabParam : "overview";
  const onTabChange = (next: string) => {
    if (!isSettingsTab(next)) return;
    setSearchParams({ tab: next });
  };

  const configQ = useQuery({
    queryKey: APP_CONFIG_QUERY_KEY,
    queryFn: ({ signal }) => apiGetJson<AppConfig>("/api/config", { signal }),
  });

  const addonsQ = useQuery({
    queryKey: ["k8s-addons-status"],
    queryFn: ({ signal }) => apiGetJson<AddonsStatusResponse>("/api/k8s/addons/status", { signal }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return (
    <div className="mx-auto w-full space-y-8 pb-12">
      <div className="space-y-4">
        <div className="px-1">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-950">集群设置</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                按运维任务维护 Kubernetes 连接、入口控制器、监控、日志与镜像仓库。保存仍写入{" "}
                <code className="rounded bg-slate-100 px-1 text-xs">MySQL 动态配置</code>，不改变现有后端接口。
              </p>
            </div>
            <Badge variant="outline" className="w-fit border-slate-200 bg-slate-50 text-slate-600">
              单页入口 · 分区维护
            </Badge>
          </div>
        </div>
        <SettingsStatusStrip
          config={configQ.data}
          addons={addonsQ.data}
          configLoading={configQ.isLoading}
          addonsLoading={addonsQ.isLoading || addonsQ.isFetching}
        />
      </div>

      <Tabs value={activeTab} onValueChange={onTabChange} className="gap-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-lg border border-slate-200 bg-slate-50/90 p-1 sm:w-auto">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="h-9 flex-none gap-1.5 px-3">
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <SectionIntro
            title="任务总览"
            description="先从状态条判断当前缺口，再进入对应分区处理。常用路径是先连接集群，再安装入口控制器或监控栈，最后补充日志与镜像仓库。"
          />
          <div className="grid gap-4 lg:grid-cols-3">
            {SETTINGS_TABS.filter((tab) => tab.value !== "overview").map((tab) => {
              const Icon = tab.icon;
              const descriptions: Record<Exclude<SettingsTabValue, "overview">, string> = {
                connection: "选择 in-cluster、进程环境或 kubeconfig，保存后热重载 Kubernetes API 连接。",
                ingress: "安装 ingress-nginx hostNetwork，维护监听端口、固定节点与清单下载策略。",
                monitoring: "安装 kube-prometheus-stack，维护 Prometheus / VictoriaMetrics 数据源并执行 PromQL 验证。",
                logs: "发现或填写 VictoriaLogs 根地址，供 AI 巡检与日志查询使用。",
                harbor: "维护 Harbor API 根地址、Robot 账号与索引缓存相关设置。",
                advanced: "集中处理 Dashboard / metrics-server 与官方 Web UI 等低频能力。",
              };

              return (
                <section key={tab.value} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-slate-950">{tab.label}</h2>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {descriptions[tab.value as Exclude<SettingsTabValue, "overview">]}
                      </p>
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => onTabChange(tab.value)}>
                    打开
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </section>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="connection" className="mt-0 space-y-4">
          <SectionIntro
            title="集群连接"
            description="维护 Kubernetes 连接方式。这里仅处理 K8s API 凭据，不承载入口控制器、监控或 Harbor 参数。"
          />
          <SettingsRuntimeSection variant="k8s" k8sFocus="connection" />
        </TabsContent>

        <TabsContent value="ingress" className="mt-0 space-y-4">
          <SectionIntro
            title="入口控制器"
            description="安装并维护 ingress-nginx hostNetwork。运行时端口、固定节点与清单下载策略仍在集群设置语境中保存。"
          />
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <ClusterK8sAddonsSection />
            <SettingsRuntimeSection variant="k8s" k8sFocus="ingress" />
          </div>
        </TabsContent>

        <TabsContent value="monitoring" className="mt-0 space-y-4">
          <SectionIntro
            title="监控"
            description="优先用 kube-prometheus-stack 建立采集栈，再配置 Prometheus 或 VictoriaMetrics vmselect 作为平台查询数据源。"
          />
          <ClusterK8sKubePrometheusStackSection />
          <SettingsPrometheusSection />
        </TabsContent>

        <TabsContent value="logs" className="mt-0 space-y-4">
          <SectionIntro
            title="日志"
            description="维护 VictoriaLogs（VMLog）地址与保留时间，供 AI 巡检、Pod 诊断和日志查询复用。"
          />
          <ClusterK8sVmLogSection />
        </TabsContent>

        <TabsContent value="harbor" className="mt-0 space-y-4">
          <SectionIntro
            title="镜像仓库"
            description="配置 Harbor API 根地址、Robot 凭据与索引缓存；应用中心镜像模版仍在应用中心维护。"
          />
          <SettingsRuntimeSection variant="k8s" k8sFocus="harbor" />
        </TabsContent>

        <TabsContent value="advanced" className="mt-0 space-y-4">
          <SectionIntro
            title="高级"
            description="低频设置集中在这里：Dashboard / metrics-server，以及官方 Web UI 的辅助安装。"
          />
          <ClusterK8sDashboardMonitoringSection />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClusterK8sSettings;
