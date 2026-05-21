import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";

const ToolNetworkIpScan = lazy(() => import("@/features/cluster/pages/ToolNetworkIpScan"));
const ComputeLayout = lazy(() => import("@/features/compute/layout/ComputeLayout"));
const ComputeDashboard = lazy(() => import("@/features/compute/pages/ComputeDashboard"));
const CloudHosts = lazy(() => import("@/features/vcenter/pages/CloudHosts"));
const CloudHostSshPage = lazy(() => import("@/features/vcenter/pages/CloudHostSshPage"));
const VCenterGpuDashboard = lazy(() => import("@/features/vcenter/pages/VCenterGpuDashboard"));
const VCenterHostDetail = lazy(() => import("@/features/vcenter/pages/VCenterHostDetail"));
const VCenterHosts = lazy(() => import("@/features/vcenter/pages/VCenterHosts"));
const VCenterHubDashboard = lazy(() => import("@/features/vcenter/pages/VCenterHubDashboard"));
const VCenterList = lazy(() => import("@/features/vcenter/pages/VCenterList"));
const VCenterSettings = lazy(() => import("@/features/vcenter/pages/VCenterSettings"));
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
const PveDashboard = lazy(() => import("@/features/compute/pve/pages/PveDashboard"));
const PveTargets = lazy(() => import("@/features/compute/pve/pages/PveTargets"));
const PveGuests = lazy(() => import("@/features/compute/pve/pages/PveGuests"));
const PveGuestDetail = lazy(() => import("@/features/compute/pve/pages/PveGuestDetail"));
const PveNodes = lazy(() => import("@/features/compute/pve/pages/PveNodes"));
const PveNodeDetail = lazy(() => import("@/features/compute/pve/pages/PveNodeDetail"));
const PveStorage = lazy(() => import("@/features/compute/pve/pages/PveStorage"));
const PveTasks = lazy(() => import("@/features/compute/pve/pages/PveTasks"));
const VCenterVMDetail = lazy(() => import("@/features/vcenter/pages/VCenterVMDetail"));

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
      <Route path="vcenter" element={<Navigate to="/cluster/compute/vcenter/vms" replace />} />
      <Route
        path="vcenter/dashboard"
        element={
          <RouteSuspense>
            <VCenterConnectionGate embedded>
              <VCenterHubDashboard />
            </VCenterConnectionGate>
          </RouteSuspense>
        }
      />
      <Route
        path="vcenter/vms"
        element={
          <RouteSuspense>
            <VCenterConnectionGate>
              <VCenterList />
            </VCenterConnectionGate>
          </RouteSuspense>
        }
      />
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
      <Route
        path="vcenter/hosts"
        element={
          <RouteSuspense>
            <VCenterConnectionGate>
              <VCenterHosts />
            </VCenterConnectionGate>
          </RouteSuspense>
        }
      />
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
      <Route path="vcenter/prometheus" element={<Navigate to="/cluster/compute/vcenter/dashboard" replace />} />
      <Route
        path="vcenter/settings"
        element={
          <RouteSuspense>
            <VCenterSettings />
          </RouteSuspense>
        }
      />
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
      <Route path="pve" element={<Navigate to="/cluster/compute/pve/dashboard" replace />} />
      <Route
        path="pve/dashboard"
        element={
          <RouteSuspense>
            <PveDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/targets"
        element={
          <RouteSuspense>
            <PveTargets />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/nodes"
        element={
          <RouteSuspense>
            <PveNodes />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/nodes/:targetId/:node"
        element={
          <RouteSuspense>
            <PveNodeDetail />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/guests"
        element={
          <RouteSuspense>
            <PveGuests />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/guests/:targetId/:node/:guestType/:vmid"
        element={
          <RouteSuspense>
            <PveGuestDetail />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/storage"
        element={
          <RouteSuspense>
            <PveStorage />
          </RouteSuspense>
        }
      />
      <Route
        path="pve/tasks"
        element={
          <RouteSuspense>
            <PveTasks />
          </RouteSuspense>
        }
      />
    </Route>
  );
}
