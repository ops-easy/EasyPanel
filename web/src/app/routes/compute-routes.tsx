import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";
import ComputeDashboard from "@/features/compute/pages/ComputeDashboard";

const PVEPage = lazy(() => import("@/features/compute/pages/PVEPage"));

export function computeRoutes(): ReactNode {
  return (
    <>
      <Route path="compute" element={<ComputeDashboard />} />
      <Route path="compute/vcenter" element={<Navigate to="/cluster/vcenter" replace />} />
      <Route path="compute/vcenter/dashboard" element={<Navigate to="/cluster/vcenter/dashboard" replace />} />
      <Route path="compute/cloud" element={<Navigate to="/cluster/vcenter/cloud" replace />} />
      <Route path="compute/bastion" element={<Navigate to="/cluster/bastion" replace />} />
      <Route
        path="compute/pve"
        element={
          <ViewerRedirect to="/cluster/compute">
            <RouteSuspense>
              <PVEPage />
            </RouteSuspense>
          </ViewerRedirect>
        }
      />
    </>
  );
}
