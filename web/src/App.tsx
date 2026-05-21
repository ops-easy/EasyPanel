import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProviders } from "@/app/providers";
import { accountRoutes } from "@/app/routes/account-routes";
import { clusterRoutes } from "@/app/routes/cluster-routes";
import { docsRoutes } from "@/app/routes/docs-routes";
import AppLayout from "@/shared/layout/AppLayout";
import { AppRouteBoundary } from "@/app/shell/AppRouteBoundary";
import RequireAuth from "@/app/guards/RequireAuth";
import SetupGate from "@/app/guards/SetupGate";
import HomeHub from "@/pages/HomeHub";
import NotFound from "@/pages/NotFound";
import Login from "@/pages/Login";
import Settings from "@/features/settings/pages/Settings";
import Setup from "@/pages/Setup";

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
            <Route path="/setup" element={<Setup />} />
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<AuthedAppShell />}>
                <Route index element={<HomeHub />} />
                <Route path="ingress" element={<Navigate to="/cluster/baota/ingress" replace />} />
                <Route path="baota" element={<Navigate to="/cluster/baota" replace />} />
                <Route path="settings" element={<Settings />} />
                {accountRoutes()}
                {docsRoutes()}
                {clusterRoutes()}
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
