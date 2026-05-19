import { lazy, type ReactNode } from "react";
import { Navigate, Route, useLocation } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";
import BastionConsoleHome from "@/features/bastion/pages/BastionConsoleHome";
import BastionLayout from "@/features/bastion/pages/BastionLayout";
import ToolNetworkIpScan from "@/features/cluster/pages/ToolNetworkIpScan";
import CloudHosts from "@/features/vcenter/pages/CloudHosts";
import CloudHostSshPage from "@/features/vcenter/pages/CloudHostSshPage";
import VCenterBastionAdmin from "@/features/vcenter/pages/VCenterBastionAdmin";
import VCenterBastionConsoleEmbed from "@/features/vcenter/pages/VCenterBastionConsoleEmbed";
import VCenterGpuDashboard from "@/features/vcenter/pages/VCenterGpuDashboard";
import VCenterHostDetail from "@/features/vcenter/pages/VCenterHostDetail";
import VCenterHosts from "@/features/vcenter/pages/VCenterHosts";
import VCenterHubDashboard from "@/features/vcenter/pages/VCenterHubDashboard";
import VCenterIkuaiRouterPage from "@/features/vcenter/pages/VCenterIkuaiRouterPage";
import VCenterList from "@/features/vcenter/pages/VCenterList";
import VCenterSettings from "@/features/vcenter/pages/VCenterSettings";

const VCenterBastionSession = lazy(() => import("@/features/vcenter/pages/VCenterBastion"));
const VCenterVMDetail = lazy(() => import("@/features/vcenter/pages/VCenterVMDetail"));

function LegacyVcenterBastionRedirect() {
  const { pathname } = useLocation();
  const rest = pathname.replace(/^\/cluster\/vcenter\/bastion\/?/, "");
  const to = rest ? `/cluster/bastion/${rest}` : "/cluster/bastion/session";
  return <Navigate to={to} replace />;
}

export function vcenterRoutes(): ReactNode {
  return (
    <>
      <Route path="vcenter/dashboard" element={<VCenterHubDashboard />} />
      <Route path="vcenter/gpu" element={<VCenterGpuDashboard />} />
      <Route path="vcenter/hosts/:moref" element={<VCenterHostDetail />} />
      <Route path="vcenter/hosts" element={<VCenterHosts />} />
      <Route
        path="vcenter/cloud/:hostId/ssh"
        element={
          <ViewerRedirect to="/cluster/vcenter/dashboard">
            <CloudHostSshPage />
          </ViewerRedirect>
        }
      />
      <Route
        path="vcenter/cloud"
        element={
          <ViewerRedirect to="/cluster/vcenter/dashboard">
            <CloudHosts />
          </ViewerRedirect>
        }
      />
      <Route path="vcenter/settings" element={<VCenterSettings />} />
      <Route path="vcenter/bastion/*" element={<LegacyVcenterBastionRedirect />} />
      <Route
        path="bastion"
        element={
          <ViewerRedirect to="/cluster/vcenter/dashboard">
            <BastionLayout />
          </ViewerRedirect>
        }
      >
        <Route index element={<BastionConsoleHome />} />
        <Route
          path="session"
          element={
            <RouteSuspense>
              <VCenterBastionSession />
            </RouteSuspense>
          }
        />
        <Route path="admin" element={<VCenterBastionAdmin />} />
        <Route path="console/:moref" element={<VCenterBastionConsoleEmbed />} />
      </Route>
      <Route
        path="vcenter/tools/ip-scan"
        element={
          <ViewerRedirect to="/cluster/vcenter/dashboard">
            <ToolNetworkIpScan />
          </ViewerRedirect>
        }
      />
      <Route path="vcenter/router" element={<VCenterIkuaiRouterPage />} />
      <Route path="vcenter" element={<VCenterList />} />
      <Route
        path="vcenter/:moref"
        element={
          <RouteSuspense>
            <VCenterVMDetail />
          </RouteSuspense>
        }
      />
    </>
  );
}
