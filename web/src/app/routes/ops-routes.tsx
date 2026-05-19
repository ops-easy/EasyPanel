import { lazy, type ReactNode } from "react";
import { Navigate, Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";

const AiInspectLayoutPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectLayout"));
const AiInspectDashboardPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectDashboard"));
const AiInspectHomePage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectHome"));
const AiInspectMonitoringPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectMonitoring"));
const AiInspectAlertsPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectAlerts"));
const AiInspectLogsPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectLogs"));
const AiInspectLogDetailsPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectLogDetails"));
const AiInspectLogCollectionPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectLogCollection"));
const AiInspectReportsPage = lazy(() => import("@/features/ops/ai-inspect/pages/AiInspectReports"));

export function opsRoutes(): ReactNode {
  return (
    <Route
      path="ai-inspect"
      element={
        <RouteSuspense>
          <AiInspectLayoutPage />
        </RouteSuspense>
      }
    >
      <Route index element={<Navigate to="dashboard" replace />} />
      <Route
        path="dashboard"
        element={
          <RouteSuspense>
            <AiInspectDashboardPage />
          </RouteSuspense>
        }
      />
      <Route
        path="reports/*"
        element={
          <RouteSuspense>
            <AiInspectReportsPage />
          </RouteSuspense>
        }
      />
      <Route
        path="configure"
        element={
          <RouteSuspense>
            <AiInspectHomePage />
          </RouteSuspense>
        }
      />
      <Route
        path="monitoring"
        element={
          <RouteSuspense>
            <AiInspectMonitoringPage />
          </RouteSuspense>
        }
      />
      <Route
        path="alerts"
        element={
          <RouteSuspense>
            <AiInspectAlertsPage />
          </RouteSuspense>
        }
      />
      <Route
        path="logs"
        element={
          <RouteSuspense>
            <AiInspectLogsPage />
          </RouteSuspense>
        }
      />
      <Route
        path="logs/detail"
        element={
          <RouteSuspense>
            <AiInspectLogDetailsPage />
          </RouteSuspense>
        }
      />
      <Route
        path="log-collection"
        element={
          <RouteSuspense>
            <AiInspectLogCollectionPage />
          </RouteSuspense>
        }
      />
    </Route>
  );
}
