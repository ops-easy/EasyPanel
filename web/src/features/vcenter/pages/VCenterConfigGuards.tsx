import React, { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import ComputeSetupPanel from "@/features/compute/components/ComputeSetupPanel";
import VCenterConnectWizard from "./VCenterConnectWizard";

function LoadingConfig() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      正在加载配置...
    </div>
  );
}

export function VCenterConnectionGate({
  children,
  embedded = false,
}: {
  children: ReactNode;
  embedded?: boolean;
}) {
  const cfgQ = useAppConfig();

  if (cfgQ.isLoading || !cfgQ.data) return <LoadingConfig />;
  if (cfgQ.data.vcenterConfigured === true) return <>{children}</>;

  return (
    <ComputeSetupPanel
      kind="vcenter"
      title="请先连接 vCenter"
      description="vCenter 的虚拟机、宿主机、控制台和详情页依赖 vCenter URL、用户名和密码。完成连接后，本模块会自动进入资源视图。"
      primaryLabel={embedded ? undefined : "打开配置"}
      primaryTo={embedded ? undefined : "/cluster/compute/config"}
      secondaryLabel={embedded ? undefined : "返回算力总览"}
      secondaryTo={embedded ? undefined : "/cluster/compute/dashboard"}
    >
      {embedded ? <VCenterConnectWizard /> : null}
    </ComputeSetupPanel>
  );
}

export function VCenterPrometheusGate({ children }: { children: ReactNode }) {
  const cfgQ = useAppConfig();
  const promOk =
    cfgQ.data?.prometheusVcenterConfigured === true ||
    cfgQ.data?.prometheusPveConfigured === true ||
    cfgQ.data?.prometheusConfigured === true;

  if (cfgQ.isLoading || !cfgQ.data) return <LoadingConfig />;
  if (promOk) return <>{children}</>;

  return (
    <ComputeSetupPanel
      kind="monitoring"
      title="请先配置虚拟化监控数据源"
      description="GPU 看板读取 Prometheus 中的 DCGM / nvidia_smi 指标，不依赖单一平台；可分别配置 prometheusUrlVcenter、prometheusUrlPve，也可让二者共用兜底 prometheusUrl。PVE 基础列表与性能页仍走 PVE API/RRD。"
      primaryLabel="打开配置"
      primaryTo="/cluster/compute/config"
      secondaryLabel="返回算力总览"
      secondaryTo="/cluster/compute/dashboard"
      compact
    />
  );
}

export function VCenterPrometheusInlineHint() {
  const cfgQ = useAppConfig();
  const promOk =
    cfgQ.data?.prometheusVcenterConfigured === true ||
    cfgQ.data?.prometheusPveConfigured === true ||
    cfgQ.data?.prometheusConfigured === true;

  if (cfgQ.isLoading || !cfgQ.data || promOk) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
      虚拟化监控数据源未配置。vCenter / PVE 基础资源列表仍可使用；如需 GPU、ESXi Prometheus 或趋势图，请前往{" "}
      <Link className="font-semibold underline" to="/cluster/compute/config">
        配置
      </Link>{" "}
      填写 prometheusUrlVcenter、prometheusUrlPve 或兜底 prometheusUrl。
    </div>
  );
}
