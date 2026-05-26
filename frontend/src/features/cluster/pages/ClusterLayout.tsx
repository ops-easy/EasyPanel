import React from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { apiGetJson, type AppConfig } from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";
import K8sConnectWizard from "./K8sConnectWizard";

const ClusterLayout: React.FC = () => {
  const { pathname } = useLocation();
  /** 应用中心：不依赖 K8s / vCenter，直接渲染子路由 */
  const isAppsSection = pathname.startsWith("/cluster/apps");
  /** 虚拟化与主机：PVE / vCenter 聚合工作区，不应被 K8s 向导拦截 */
  const isComputeSection = pathname.startsWith("/cluster/compute");
  /** 网络设备：iKuai / OpenWrt 聚合工作区，不应被 K8s 向导拦截 */
  const isNetworkSection = pathname.startsWith("/cluster/network");
  /** 堡垒机：独立工作区，不依赖 vCenter 向导横幅 */
  const isBastionWorkspace =
    pathname === "/cluster/bastion" ||
    pathname.startsWith("/cluster/bastion/");
  const isBastionSection = isBastionWorkspace;
  /** AI 巡检 / 监控 / 告警：独立子路由 */
  const isAiInspectSection = pathname.startsWith("/cluster/ai-inspect");
  /** Harbor 仓库：仅需运行时 Harbor 凭据，不要求 K8s 已连通 */
  const isHarborSection = pathname.startsWith("/cluster/harbor");
  /** 内网工具箱（IP 扫描等）：挂在 /cluster/compute/tools，不依赖 vCenter/K8s API */
  const isToolboxSection = pathname.startsWith("/cluster/compute/tools");
  /** 旧 vCenter 路径：只负责重定向到统一的「虚拟化与主机」工作区 */
  const isLegacyVCenterSection = pathname.startsWith("/cluster/vcenter");
  const isBastionShell =
    pathname === "/cluster/bastion/session" ||
    pathname.startsWith("/cluster/bastion/session/") ||
    pathname.startsWith("/cluster/bastion/console/");
  /** 子页自带标题（如 Cluster Settings / 虚拟化配置）时不再重复「Kubernetes 集群」横幅 */
  const hideClusterIntro =
    pathname === "/cluster/pod-restart-reports" ||
    pathname === "/cluster/settings" ||
    pathname === "/cluster/etcd" ||
    isBastionShell ||
    pathname.startsWith("/cluster/bastion/console/") ||
    isAppsSection ||
    isComputeSection ||
    isNetworkSection ||
    isLegacyVCenterSection ||
    isBastionSection ||
    isAiInspectSection ||
    isToolboxSection ||
    isHarborSection;

  const configQ = useAppConfig();

  const pending = configQ.isPending || configQ.isLoading;
  const failed = configQ.isError;
  const d = configQ.data;
  const k8sOk = d?.k8sConfigured === true;

  /**
   * 配置尚未返回或请求失败时仍渲染 Outlet，避免子路由整页空白（刷新才恢复多由此引起）。
   * 仅在已拿到 data 且明确未配置时，再只显示连接向导。
   */
  let main: React.ReactNode;
  if (
    isAppsSection ||
    isComputeSection ||
    isNetworkSection ||
    isLegacyVCenterSection ||
    isAiInspectSection ||
    isBastionSection ||
    isHarborSection
  ) {
    main = <Outlet />;
  } else {
    if (pending || failed) {
      main = <Outlet />;
    } else if (k8sOk) {
      main = <Outlet />;
    } else if (d) {
      main = <K8sConnectWizard />;
    } else {
      main = <Outlet />;
    }
  }

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[min(100%,1600px)] px-1 pb-12 sm:px-0",
        isBastionWorkspace && "h-full min-h-0 max-w-none px-0 pb-0"
      )}
    >
      {!hideClusterIntro && (
        <div className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-gray-900 dark:text-slate-100">Kubernetes 集群</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400">概览：集群态 → 命名空间 → Pod</p>
        </div>
      )}
      {!isAppsSection && !isComputeSection && !isNetworkSection && !isLegacyVCenterSection && !isAiInspectSection && pending && (
        <p className="mb-2 text-sm text-gray-500">正在加载集群配置…</p>
      )}
      {!isAppsSection && !isComputeSection && !isNetworkSection && !isLegacyVCenterSection && !isAiInspectSection && failed && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          无法读取 /api/config：{extractErrorMessage(configQ.error)}。下方页面仍会尝试加载；请检查网络或服务端。
        </p>
      )}
      {main}
    </div>
  );
};

export default ClusterLayout;
