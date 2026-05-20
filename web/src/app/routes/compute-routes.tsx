import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ComputeLayout from "@/features/compute/layout/ComputeLayout";
import ComputeDashboard from "@/features/compute/pages/ComputeDashboard";

const PveDashboard = lazy(() => import("@/features/compute/pve/pages/PveDashboard"));
const PveTargets = lazy(() => import("@/features/compute/pve/pages/PveTargets"));
const PveGuests = lazy(() => import("@/features/compute/pve/pages/PveGuests"));
const PveNodes = lazy(() => import("@/features/compute/pve/pages/PveNodes"));
const PveStorage = lazy(() => import("@/features/compute/pve/pages/PveStorage"));
const PveTasks = lazy(() => import("@/features/compute/pve/pages/PveTasks"));

export function computeRoutes(): ReactNode {
  return (
    <Route path="compute" element={<ComputeLayout />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<ComputeDashboard />} />
      <Route path="vcenter" element={<Navigate to="/cluster/compute/vcenter/vms" replace />} />
      <Route path="vcenter/dashboard" element={<Navigate to="/cluster/vcenter/dashboard" replace />} />
      <Route path="vcenter/vms" element={<Navigate to="/cluster/vcenter" replace />} />
      <Route path="vcenter/hosts" element={<Navigate to="/cluster/vcenter/hosts" replace />} />
      <Route path="vcenter/gpu" element={<Navigate to="/cluster/vcenter/gpu" replace />} />
      <Route path="vcenter/prometheus" element={<Navigate to="/cluster/vcenter/dashboard" replace />} />
      <Route path="vcenter/settings" element={<Navigate to="/cluster/vcenter/settings" replace />} />
      <Route path="cloud" element={<Navigate to="/cluster/vcenter/cloud" replace />} />
      <Route path="bastion" element={<Navigate to="/cluster/bastion" replace />} />
      <Route path="tools/ip-scan" element={<Navigate to="/cluster/vcenter/tools/ip-scan" replace />} />
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
