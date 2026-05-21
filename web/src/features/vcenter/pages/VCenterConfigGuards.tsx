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
      primaryLabel={embedded ? undefined : "打开 vCenter 设置"}
      primaryTo={embedded ? undefined : "/cluster/compute/vcenter/settings"}
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
    cfgQ.data?.prometheusConfigured === true;

  if (cfgQ.isLoading || !cfgQ.data) return <LoadingConfig />;
  if (promOk) return <>{children}</>;

  return (
    <ComputeSetupPanel
      kind="vcenter"
      title="请先配置 vCenter 监控数据源"
      description="GPU 与 Prometheus 看板依赖 prometheusUrlVcenter，未单独配置时可使用兜底 prometheusUrl。VM 与宿主机基础列表不受该项影响。"
      primaryLabel="打开 vCenter 设置"
      primaryTo="/cluster/compute/vcenter/settings"
      secondaryLabel="返回 vCenter"
      secondaryTo="/cluster/compute/vcenter/dashboard"
      compact
    />
  );
}

export function VCenterPrometheusInlineHint() {
  const cfgQ = useAppConfig();
  const promOk =
    cfgQ.data?.prometheusVcenterConfigured === true ||
    cfgQ.data?.prometheusConfigured === true;

  if (cfgQ.isLoading || !cfgQ.data || promOk) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
      vCenter 监控数据源未配置。基础资源列表仍可使用；如需 GPU、ESXi Prometheus 或趋势图，请前往{" "}
      <Link className="font-semibold underline" to="/cluster/compute/vcenter/settings">
        vCenter 设置
      </Link>{" "}
      填写 prometheusUrlVcenter 或兜底 prometheusUrl。
    </div>
  );
}
