import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";
import NetworkDashboard from "@/features/network/pages/NetworkDashboard";

const VCenterIkuaiRouterPage = lazy(() => import("@/features/vcenter/pages/VCenterIkuaiRouterPage"));

export function networkRoutes(): ReactNode {
  return (
    <>
      <Route
        path="network"
        element={
          <ViewerRedirect to="/cluster">
            <NetworkDashboard />
          </ViewerRedirect>
        }
      />
      <Route
        path="network/ikuai"
        element={
          <ViewerRedirect to="/cluster/network">
            <RouteSuspense>
              <VCenterIkuaiRouterPage />
            </RouteSuspense>
          </ViewerRedirect>
        }
      />
      <Route path="network/openwrt" element={<Navigate to="/cluster/network?kind=openwrt" replace />} />
    </>
  );
}
