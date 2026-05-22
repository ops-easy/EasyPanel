import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";

const NetworkLayout = lazy(() => import("@/features/network/layout/NetworkLayout"));
const NetworkDashboard = lazy(() => import("@/features/network/pages/NetworkDashboard"));
const NetworkResourcePage = lazy(() => import("@/features/network/pages/NetworkResourcePage"));
const NetworkConfigPage = lazy(() => import("@/features/network/pages/NetworkConfigPage"));

export function networkRoutes(): ReactNode {
  return (
    <Route
      path="network"
      element={
        <RouteSuspense>
          <NetworkLayout />
        </RouteSuspense>
      }
    >
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route
        path="dashboard"
        element={
          <RouteSuspense>
            <NetworkDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="devices"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="devices" />
          </RouteSuspense>
        }
      />
      <Route
        path="interfaces"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="interfaces" />
          </RouteSuspense>
        }
      />
      <Route
        path="clients"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="clients" />
          </RouteSuspense>
        }
      />
      <Route
        path="wireless"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="wireless" />
          </RouteSuspense>
        }
      />
      <Route
        path="connections"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="connections" />
          </RouteSuspense>
        }
      />
      <Route
        path="monitoring"
        element={
          <RouteSuspense>
            <NetworkResourcePage view="monitoring" />
          </RouteSuspense>
        }
      />
      <Route
        path="config"
        element={
          <RouteSuspense>
            <NetworkConfigPage />
          </RouteSuspense>
        }
      />

      <Route path="ikuai" element={<Navigate to="/cluster/network/devices?provider=ikuai" replace />} />
      <Route path="ikuai/dashboard" element={<Navigate to="/cluster/network/devices?provider=ikuai" replace />} />
      <Route path="ikuai/interfaces" element={<Navigate to="/cluster/network/interfaces?provider=ikuai" replace />} />
      <Route path="ikuai/clients" element={<Navigate to="/cluster/network/clients?provider=ikuai" replace />} />
      <Route path="ikuai/apps" element={<Navigate to="/cluster/network/devices?provider=ikuai" replace />} />
      <Route path="ikuai/vm-mapping" element={<Navigate to="/cluster/network/clients?provider=ikuai" replace />} />
      <Route path="ikuai/exporter" element={<Navigate to="/cluster/network/monitoring?provider=ikuai" replace />} />

      <Route path="openwrt" element={<Navigate to="/cluster/network/devices?provider=openwrt" replace />} />
      <Route path="openwrt/dashboard" element={<Navigate to="/cluster/network/devices?provider=openwrt" replace />} />
      <Route path="openwrt/interfaces" element={<Navigate to="/cluster/network/interfaces?provider=openwrt" replace />} />
      <Route path="openwrt/clients" element={<Navigate to="/cluster/network/clients?provider=openwrt" replace />} />
      <Route path="openwrt/connections" element={<Navigate to="/cluster/network/connections?provider=openwrt" replace />} />
      <Route path="openwrt/wireless" element={<Navigate to="/cluster/network/wireless?provider=openwrt" replace />} />
      <Route path="openwrt/exporter" element={<Navigate to="/cluster/network/monitoring?provider=openwrt" replace />} />
    </Route>
  );
}
