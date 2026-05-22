import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";

const ToolNetworkIpScan = lazy(() => import("@/features/cluster/pages/ToolNetworkIpScan"));
const ComputeLayout = lazy(() => import("@/features/compute/layout/ComputeLayout"));
const ComputeDashboard = lazy(() => import("@/features/compute/pages/ComputeDashboard"));
const ComputeResourcePage = lazy(() => import("@/features/compute/pages/ComputeResourcePage"));
const VirtualMachineSettings = lazy(() => import("@/features/compute/pages/VirtualMachineSettings"));
const CloudHosts = lazy(() => import("@/features/vcenter/pages/CloudHosts"));
const CloudHostSshPage = lazy(() => import("@/features/vcenter/pages/CloudHostSshPage"));
const VCenterGpuDashboard = lazy(() => import("@/features/vcenter/pages/VCenterGpuDashboard"));
const VCenterHostDetail = lazy(() => import("@/features/vcenter/pages/VCenterHostDetail"));
const VCenterVMDetail = lazy(() => import("@/features/vcenter/pages/VCenterVMDetail"));
const VCenterConnectionGate = lazy(() =>
  import("@/features/vcenter/pages/VCenterConfigGuards").then((m) => ({
    default: m.VCenterConnectionGate,
  }))
);
const VCenterPrometheusGate = lazy(() =>
  import("@/features/vcenter/pages/VCenterConfigGuards").then((m) => ({
    default: m.VCenterPrometheusGate,
  }))
);
const PveGuestDetail = lazy(() => import("@/features/compute/pve/pages/PveGuestDetail"));
const PveNodeDetail = lazy(() => import("@/features/compute/pve/pages/PveNodeDetail"));

function resourcePage(view: "guests" | "hosts" | "storage" | "activity") {
  return (
    <RouteSuspense>
      <ComputeResourcePage view={view} />
    </RouteSuspense>
  );
}

export function computeRoutes(): ReactNode {
  return (
    <Route
      path="compute"
      element={
        <RouteSuspense>
          <ComputeLayout />
        </RouteSuspense>
      }
    >
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route
        path="dashboard"
        element={
          <RouteSuspense>
            <ComputeDashboard />
          </RouteSuspense>
        }
      />
      <Route path="guests" element={resourcePage("guests")} />
      <Route path="hosts" element={resourcePage("hosts")} />
      <Route path="storage" element={resourcePage("storage")} />
      <Route path="activity" element={resourcePage("activity")} />
      <Route
        path="config"
        element={
          <RouteSuspense>
            <VirtualMachineSettings />
          </RouteSuspense>
        }
      />
      <Route path="vm-settings" element={<Navigate to="/cluster/compute/config" replace />} />

      <Route path="vcenter" element={<Navigate to="/cluster/compute/guests" replace />} />
      <Route path="vcenter/dashboard" element={<Navigate to="/cluster/compute/dashboard" replace />} />
      <Route
        path="vcenter/vms/:moref"
        element={
          <RouteSuspense>
            <VCenterConnectionGate>
              <VCenterVMDetail />
            </VCenterConnectionGate>
          </RouteSuspense>
        }
      />
      <Route path="vcenter/vms" element={<Navigate to="/cluster/compute/guests" replace />} />
      <Route
        path="vcenter/hosts/:moref"
        element={
          <RouteSuspense>
            <VCenterConnectionGate>
              <VCenterHostDetail />
            </VCenterConnectionGate>
          </RouteSuspense>
        }
      />
      <Route path="vcenter/hosts" element={<Navigate to="/cluster/compute/hosts" replace />} />
      <Route
        path="vcenter/gpu"
        element={
          <RouteSuspense>
            <VCenterPrometheusGate>
              <VCenterGpuDashboard />
            </VCenterPrometheusGate>
          </RouteSuspense>
        }
      />
      <Route path="vcenter/prometheus" element={<Navigate to="/cluster/compute/dashboard" replace />} />

      <Route path="pve" element={<Navigate to="/cluster/compute/guests" replace />} />
      <Route path="pve/dashboard" element={<Navigate to="/cluster/compute/dashboard" replace />} />
      <Route path="pve/targets" element={<Navigate to="/cluster/compute/config" replace />} />
      <Route
        path="pve/nodes/:targetId/:node"
        element={
          <RouteSuspense>
            <PveNodeDetail />
          </RouteSuspense>
        }
      />
      <Route path="pve/nodes" element={<Navigate to="/cluster/compute/hosts" replace />} />
      <Route
        path="pve/guests/:targetId/:node/:guestType/:vmid"
        element={
          <RouteSuspense>
            <PveGuestDetail />
          </RouteSuspense>
        }
      />
      <Route path="pve/guests" element={<Navigate to="/cluster/compute/guests" replace />} />
      <Route path="pve/storage" element={<Navigate to="/cluster/compute/storage" replace />} />
      <Route path="pve/tasks" element={<Navigate to="/cluster/compute/activity" replace />} />

      <Route
        path="cloud/:hostId/ssh"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <RouteSuspense>
              <CloudHostSshPage />
            </RouteSuspense>
          </ViewerRedirect>
        }
      />
      <Route
        path="cloud"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <RouteSuspense>
              <CloudHosts />
            </RouteSuspense>
          </ViewerRedirect>
        }
      />
      <Route path="bastion" element={<Navigate to="/cluster/bastion" replace />} />
      <Route
        path="tools/ip-scan"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <RouteSuspense>
              <ToolNetworkIpScan />
            </RouteSuspense>
          </ViewerRedirect>
        }
      />
    </Route>
  );
}
