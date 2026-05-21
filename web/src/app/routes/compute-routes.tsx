import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";
import ToolNetworkIpScan from "@/features/cluster/pages/ToolNetworkIpScan";
import ComputeLayout from "@/features/compute/layout/ComputeLayout";
import ComputeDashboard from "@/features/compute/pages/ComputeDashboard";
import CloudHosts from "@/features/vcenter/pages/CloudHosts";
import CloudHostSshPage from "@/features/vcenter/pages/CloudHostSshPage";
import VCenterGpuDashboard from "@/features/vcenter/pages/VCenterGpuDashboard";
import VCenterHostDetail from "@/features/vcenter/pages/VCenterHostDetail";
import VCenterHosts from "@/features/vcenter/pages/VCenterHosts";
import VCenterHubDashboard from "@/features/vcenter/pages/VCenterHubDashboard";
import VCenterList from "@/features/vcenter/pages/VCenterList";
import VCenterSettings from "@/features/vcenter/pages/VCenterSettings";

const PveDashboard = lazy(() => import("@/features/compute/pve/pages/PveDashboard"));
const PveTargets = lazy(() => import("@/features/compute/pve/pages/PveTargets"));
const PveGuests = lazy(() => import("@/features/compute/pve/pages/PveGuests"));
const PveNodes = lazy(() => import("@/features/compute/pve/pages/PveNodes"));
const PveStorage = lazy(() => import("@/features/compute/pve/pages/PveStorage"));
const PveTasks = lazy(() => import("@/features/compute/pve/pages/PveTasks"));
const VCenterVMDetail = lazy(() => import("@/features/vcenter/pages/VCenterVMDetail"));

export function computeRoutes(): ReactNode {
  return (
    <Route path="compute" element={<ComputeLayout />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<ComputeDashboard />} />
      <Route path="vcenter" element={<Navigate to="/cluster/compute/vcenter/vms" replace />} />
      <Route path="vcenter/dashboard" element={<VCenterHubDashboard />} />
      <Route path="vcenter/vms" element={<VCenterList />} />
      <Route
        path="vcenter/vms/:moref"
        element={
          <RouteSuspense>
            <VCenterVMDetail />
          </RouteSuspense>
        }
      />
      <Route path="vcenter/hosts/:moref" element={<VCenterHostDetail />} />
      <Route path="vcenter/hosts" element={<VCenterHosts />} />
      <Route path="vcenter/gpu" element={<VCenterGpuDashboard />} />
      <Route path="vcenter/prometheus" element={<Navigate to="/cluster/compute/vcenter/dashboard" replace />} />
      <Route path="vcenter/settings" element={<VCenterSettings />} />
      <Route
        path="cloud/:hostId/ssh"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <CloudHostSshPage />
          </ViewerRedirect>
        }
      />
      <Route
        path="cloud"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <CloudHosts />
          </ViewerRedirect>
        }
      />
      <Route path="bastion" element={<Navigate to="/cluster/bastion" replace />} />
      <Route
        path="tools/ip-scan"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <ToolNetworkIpScan />
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
        path="pve/guests"
        element={
          <RouteSuspense>
            <PveGuests />
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
