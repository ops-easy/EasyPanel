import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import NetworkLayout from "@/features/network/layout/NetworkLayout";
import NetworkDashboard from "@/features/network/pages/NetworkDashboard";

const IkuaiDashboard = lazy(() => import("@/features/network/ikuai/pages/IkuaiDashboard"));
const IkuaiClients = lazy(() => import("@/features/network/ikuai/pages/IkuaiClients"));
const IkuaiInterfaces = lazy(() => import("@/features/network/ikuai/pages/IkuaiInterfaces"));
const IkuaiVmMapping = lazy(() => import("@/features/network/ikuai/pages/IkuaiVmMapping"));
const OpenWrtDashboard = lazy(() => import("@/features/network/openwrt/pages/OpenWrtDashboard"));
const OpenWrtClients = lazy(() => import("@/features/network/openwrt/pages/OpenWrtClients"));
const OpenWrtInterfaces = lazy(() => import("@/features/network/openwrt/pages/OpenWrtInterfaces"));
const OpenWrtConnections = lazy(() => import("@/features/network/openwrt/pages/OpenWrtConnections"));
const OpenWrtWireless = lazy(() => import("@/features/network/openwrt/pages/OpenWrtWireless"));

export function networkRoutes(): ReactNode {
  return (
    <Route path="network" element={<NetworkLayout />}>
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route path="dashboard" element={<NetworkDashboard />} />
      <Route
        path="ikuai"
        element={<Navigate to="/cluster/network/ikuai/dashboard" replace />}
      />
      <Route
        path="ikuai/dashboard"
        element={
          <RouteSuspense>
            <IkuaiDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="ikuai/interfaces"
        element={
          <RouteSuspense>
            <IkuaiInterfaces />
          </RouteSuspense>
        }
      />
      <Route
        path="ikuai/clients"
        element={
          <RouteSuspense>
            <IkuaiClients />
          </RouteSuspense>
        }
      />
      <Route
        path="ikuai/apps"
        element={
          <RouteSuspense>
            <IkuaiDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="ikuai/vm-mapping"
        element={
          <RouteSuspense>
            <IkuaiVmMapping />
          </RouteSuspense>
        }
      />
      <Route
        path="ikuai/exporter"
        element={
          <RouteSuspense>
            <IkuaiDashboard />
          </RouteSuspense>
        }
      />
      <Route path="openwrt" element={<Navigate to="/cluster/network/openwrt/dashboard" replace />} />
      <Route
        path="openwrt/dashboard"
        element={
          <RouteSuspense>
            <OpenWrtDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="openwrt/interfaces"
        element={
          <RouteSuspense>
            <OpenWrtInterfaces />
          </RouteSuspense>
        }
      />
      <Route
        path="openwrt/clients"
        element={
          <RouteSuspense>
            <OpenWrtClients />
          </RouteSuspense>
        }
      />
      <Route
        path="openwrt/connections"
        element={
          <RouteSuspense>
            <OpenWrtConnections />
          </RouteSuspense>
        }
      />
      <Route
        path="openwrt/wireless"
        element={
          <RouteSuspense>
            <OpenWrtWireless />
          </RouteSuspense>
        }
      />
      <Route
        path="openwrt/exporter"
        element={
          <RouteSuspense>
            <OpenWrtDashboard />
          </RouteSuspense>
        }
      />
    </Route>
  );
}
