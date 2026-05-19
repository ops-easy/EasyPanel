import { lazy, type ReactNode } from "react";
import { Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";
import AccountPersonalCenter from "@/features/account/pages/AccountPersonalCenter";
import AccountSettings from "@/features/account/pages/AccountSettings";
import SiteStats from "@/features/account/pages/SiteStats";

const PlatformUsersPage = lazy(() => import("@/features/account/pages/PlatformUsers"));
const PlatformAuditPage = lazy(() => import("@/features/account/pages/PlatformAudit"));

export function accountRoutes(): ReactNode {
  return (
    <>
      <Route path="account/settings" element={<AccountSettings />} />
      <Route path="account/personal" element={<AccountPersonalCenter />} />
      <Route
        path="account/users"
        element={
          <RouteSuspense>
            <PlatformUsersPage />
          </RouteSuspense>
        }
      />
      <Route
        path="account/audit"
        element={
          <RouteSuspense>
            <PlatformAuditPage />
          </RouteSuspense>
        }
      />
      <Route path="account/site-stats" element={<SiteStats />} />
    </>
  );
}
