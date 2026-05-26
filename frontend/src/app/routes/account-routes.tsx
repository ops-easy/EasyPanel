import { lazy, type ReactNode } from "react";
import { Route } from "react-router-dom";
import { RouteSuspense } from "@/app/route-fallback";

const AccountPersonalCenter = lazy(() => import("@/features/account/pages/AccountPersonalCenter"));
const AccountSettings = lazy(() => import("@/features/account/pages/AccountSettings"));
const PlatformUsersPage = lazy(() => import("@/features/account/pages/PlatformUsers"));
const PlatformAuditPage = lazy(() => import("@/features/account/pages/PlatformAudit"));
const SiteStats = lazy(() => import("@/features/account/pages/SiteStats"));

function withBase(basePath: string, path: string): string {
  return basePath ? `${basePath}/${path}` : path;
}

export function accountRoutes(basePath = "account"): ReactNode {
  return (
    <>
      <Route
        path={withBase(basePath, "settings")}
        element={
          <RouteSuspense>
            <AccountSettings />
          </RouteSuspense>
        }
      />
      <Route
        path={withBase(basePath, "personal")}
        element={
          <RouteSuspense>
            <AccountPersonalCenter />
          </RouteSuspense>
        }
      />
      <Route
        path={withBase(basePath, "users")}
        element={
          <RouteSuspense>
            <PlatformUsersPage />
          </RouteSuspense>
        }
      />
      <Route
        path={withBase(basePath, "audit")}
        element={
          <RouteSuspense>
            <PlatformAuditPage />
          </RouteSuspense>
        }
      />
      <Route
        path={withBase(basePath, "site-stats")}
        element={
          <RouteSuspense>
            <SiteStats />
          </RouteSuspense>
        }
      />
    </>
  );
}
