import { lazy, type ReactNode } from "react";
import { Navigate, Route, useLocation, useParams } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import ViewerRedirect from "@/app/guards/ViewerRedirect";

const BastionConsoleHome = lazy(() => import("@/features/bastion/pages/BastionConsoleHome"));
const BastionLayout = lazy(() => import("@/features/bastion/pages/BastionLayout"));
const VCenterBastionAdmin = lazy(() => import("@/features/vcenter/pages/VCenterBastionAdmin"));
const VCenterBastionConsoleEmbed = lazy(() => import("@/features/vcenter/pages/VCenterBastionConsoleEmbed"));
const VCenterBastionSession = lazy(() => import("@/features/vcenter/pages/VCenterBastion"));

function encodeSegment(v?: string): string {
  return encodeURIComponent(v || "");
}

function LegacyVcenterBastionRedirect() {
  const { pathname } = useLocation();
  const rest = pathname.replace(/^\/cluster\/vcenter\/bastion\/?/, "");
  const to = rest ? `/cluster/bastion/${rest}` : "/cluster/bastion/session";
  return <Navigate to={to} replace />;
}

function LegacyVcenterHostRedirect() {
  const { moref } = useParams();
  return <Navigate to={`/cluster/compute/vcenter/hosts/${encodeSegment(moref)}`} replace />;
}

function LegacyVcenterVmRedirect() {
  const { moref } = useParams();
  return <Navigate to={`/cluster/compute/vcenter/vms/${encodeSegment(moref)}`} replace />;
}

function LegacyCloudHostSshRedirect() {
  const { hostId } = useParams();
  return <Navigate to={`/cluster/compute/cloud/${encodeSegment(hostId)}/ssh`} replace />;
}

export function vcenterRoutes(): ReactNode {
  return (
    <>
      <Route path="vcenter/dashboard" element={<Navigate to="/cluster/compute/dashboard" replace />} />
      <Route path="vcenter/gpu" element={<Navigate to="/cluster/compute/vcenter/gpu" replace />} />
      <Route path="vcenter/hosts/:moref" element={<LegacyVcenterHostRedirect />} />
      <Route path="vcenter/hosts" element={<Navigate to="/cluster/compute/hosts" replace />} />
      <Route path="vcenter/cloud/:hostId/ssh" element={<LegacyCloudHostSshRedirect />} />
      <Route path="vcenter/cloud" element={<Navigate to="/cluster/compute/cloud" replace />} />
      <Route path="vcenter/bastion/*" element={<LegacyVcenterBastionRedirect />} />
      <Route
        path="bastion"
        element={
          <ViewerRedirect to="/cluster/compute/dashboard">
            <RouteSuspense>
              <BastionLayout />
            </RouteSuspense>
          </ViewerRedirect>
        }
      >
        <Route
          index
          element={
            <RouteSuspense>
              <BastionConsoleHome />
            </RouteSuspense>
          }
        />
        <Route
          path="session"
          element={
            <RouteSuspense>
              <VCenterBastionSession />
            </RouteSuspense>
          }
        />
        <Route
          path="admin"
          element={
            <RouteSuspense>
              <VCenterBastionAdmin />
            </RouteSuspense>
          }
        />
        <Route
          path="console/:moref"
          element={
            <RouteSuspense>
              <VCenterBastionConsoleEmbed />
            </RouteSuspense>
          }
        />
      </Route>
      <Route path="vcenter/tools/ip-scan" element={<Navigate to="/cluster/compute/tools/ip-scan" replace />} />
      <Route path="vcenter/prometheus" element={<Navigate to="/cluster/compute/dashboard" replace />} />
      <Route path="vcenter/router" element={<Navigate to="/cluster/network/ikuai/dashboard" replace />} />
      <Route path="vcenter" element={<Navigate to="/cluster/compute/guests" replace />} />
      <Route path="vcenter/:moref" element={<LegacyVcenterVmRedirect />} />
    </>
  );
}
