import { lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import AppLayout from "@/shared/layout/AppLayout";
import { AppRouteBoundary } from "@/app/shell/AppRouteBoundary";
import { RouteSuspense } from "@/app/route-fallback";
import RequireAuth from "@/app/guards/RequireAuth";
import SetupGate from "@/app/guards/SetupGate";
import NotFound from "@/pages/NotFound";

const HomeHub = lazy(() => import("@/pages/HomeHub"));
const Login = lazy(() => import("@/pages/Login"));
const Settings = lazy(() => import("@/features/settings/pages/Settings"));
const Setup = lazy(() => import("@/pages/Setup"));
const AccountRoutesIsland = lazy(() => import("@/app/route-islands/AccountRoutesIsland"));
const ClusterRoutesIsland = lazy(() => import("@/app/route-islands/ClusterRoutesIsland"));
const DocsRoutesIsland = lazy(() => import("@/app/route-islands/DocsRoutesIsland"));

function AuthedAppShell() {
  return (
    <AppRouteBoundary>
      <AppLayout />
    </AppRouteBoundary>
  );
}

const App = () => {
  return (
    <AppProviders>
      <BrowserRouter>
        <Routes>
          <Route element={<SetupGate />}>
            <Route path="/setup" element={<RouteSuspense><Setup /></RouteSuspense>} />
            <Route path="/login" element={<RouteSuspense><Login /></RouteSuspense>} />
            <Route element={<RequireAuth />}>
              <Route element={<AuthedAppShell />}>
                <Route index element={<RouteSuspense><HomeHub /></RouteSuspense>} />
                <Route path="ingress" element={<Navigate to="/cluster/baota/ingress" replace />} />
                <Route path="baota" element={<Navigate to="/cluster/baota" replace />} />
                <Route path="settings" element={<RouteSuspense><Settings /></RouteSuspense>} />
                <Route path="account/*" element={<RouteSuspense><AccountRoutesIsland /></RouteSuspense>} />
                <Route path="docs/*" element={<RouteSuspense><DocsRoutesIsland /></RouteSuspense>} />
                <Route path="cluster/*" element={<RouteSuspense><ClusterRoutesIsland /></RouteSuspense>} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AppProviders>
  );
};

export default App;
