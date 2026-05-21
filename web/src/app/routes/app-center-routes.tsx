import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";

const AppCenterDashboard = lazy(() => import("@/features/app-center/layout/AppCenterDashboard"));
const AppCenterLayout = lazy(() => import("@/features/app-center/layout/AppCenterLayout"));
const AppCenterRedis = lazy(() => import("@/features/app-center/redis/pages/AppCenterRedis"));
const AppCenterOpenSearch = lazy(
  () => import("@/features/app-center/opensearch/pages/AppCenterOpenSearch")
);
const AppCenterKafka = lazy(() => import("@/features/app-center/kafka/pages/AppCenterKafka"));
const AppCenterKafkaInstance = lazy(() =>
  import("@/features/app-center/kafka/pages/AppCenterKafka").then((m) => ({
    default: m.AppCenterKafkaInstancePage,
  }))
);
const AppCenterKafkaThrottle = lazy(
  () => import("@/features/app-center/kafka/pages/AppCenterKafkaThrottle")
);
const AppCenterDns = lazy(() => import("@/features/dns/pages/DnsLayout"));
const AppCenterCloudVm = lazy(() => import("@/features/app-center/cloudvm/pages/AppCenterCloudVm"));
const AppCenterCloudVmBootstrap = lazy(
  () => import("@/features/app-center/cloudvm/pages/AppCenterCloudVmBootstrap")
);
const AppCenterCloudVmDetail = lazy(
  () => import("@/features/app-center/cloudvm/pages/AppCenterCloudVmDetail")
);
const AppCenterOpenClaw = lazy(
  () => import("@/features/app-center/openclaw/pages/AppCenterOpenClaw")
);
const AppCenterOpenClawBootstrap = lazy(
  () => import("@/features/app-center/openclaw/pages/AppCenterOpenClawBootstrap")
);
const AppCenterOpenClawDetail = lazy(
  () => import("@/features/app-center/openclaw/pages/AppCenterOpenClawDetail")
);
const AppCenterHermes = lazy(() => import("@/features/app-center/hermes/pages/AppCenterHermes"));
const AppCenterHermesBootstrap = lazy(
  () => import("@/features/app-center/hermes/pages/AppCenterHermesBootstrap")
);
const AppCenterHermesCreate = lazy(
  () => import("@/features/app-center/hermes/pages/AppCenterHermesCreate")
);
const AppCenterHermesDetail = lazy(
  () => import("@/features/app-center/hermes/pages/AppCenterHermesDetail")
);

export function appCenterRoutes(): ReactNode {
  return (
    <Route
      path="apps"
      element={
        <RouteSuspense>
          <AppCenterLayout />
        </RouteSuspense>
      }
    >
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route
        path="dashboard"
        element={
          <RouteSuspense>
            <AppCenterDashboard />
          </RouteSuspense>
        }
      />
      <Route
        path="redis"
        element={
          <RouteSuspense>
            <AppCenterRedis />
          </RouteSuspense>
        }
      />
      <Route
        path="opensearch"
        element={
          <RouteSuspense>
            <AppCenterOpenSearch />
          </RouteSuspense>
        }
      />
      <Route
        path="kafka/instance/:id/throttle"
        element={
          <RouteSuspense>
            <AppCenterKafkaThrottle />
          </RouteSuspense>
        }
      />
      <Route
        path="kafka/instance/:id"
        element={
          <RouteSuspense>
            <AppCenterKafkaInstance />
          </RouteSuspense>
        }
      />
      <Route
        path="kafka"
        element={
          <RouteSuspense>
            <AppCenterKafka />
          </RouteSuspense>
        }
      />
      <Route
        path="dns/*"
        element={
          <RouteSuspense>
            <AppCenterDns />
          </RouteSuspense>
        }
      />
      <Route
        path="cloud-vm/bootstrap"
        element={
          <RouteSuspense>
            <AppCenterCloudVmBootstrap />
          </RouteSuspense>
        }
      />
      <Route
        path="cloud-vm/:id"
        element={
          <RouteSuspense>
            <AppCenterCloudVmDetail />
          </RouteSuspense>
        }
      />
      <Route
        path="cloud-vm"
        element={
          <RouteSuspense>
            <AppCenterCloudVm />
          </RouteSuspense>
        }
      />
      <Route
        path="openclaw/bootstrap"
        element={
          <RouteSuspense>
            <AppCenterOpenClawBootstrap />
          </RouteSuspense>
        }
      />
      <Route
        path="openclaw/:id"
        element={
          <RouteSuspense>
            <AppCenterOpenClawDetail />
          </RouteSuspense>
        }
      />
      <Route
        path="openclaw"
        element={
          <RouteSuspense>
            <AppCenterOpenClaw />
          </RouteSuspense>
        }
      />
      <Route
        path="hermes/bootstrap"
        element={
          <RouteSuspense>
            <AppCenterHermesBootstrap />
          </RouteSuspense>
        }
      />
      <Route
        path="hermes/create"
        element={
          <RouteSuspense>
            <AppCenterHermesCreate />
          </RouteSuspense>
        }
      />
      <Route
        path="hermes/:id"
        element={
          <RouteSuspense>
            <AppCenterHermesDetail />
          </RouteSuspense>
        }
      />
      <Route
        path="hermes"
        element={
          <RouteSuspense>
            <AppCenterHermes />
          </RouteSuspense>
        }
      />
    </Route>
  );
}
