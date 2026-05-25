import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import RedisStatusBanner from "@/features/app-center/redis/components/RedisStatusBanner";
import PlatformVersionBanner from "./PlatformVersionBanner";
import AppLayoutMobile from "./AppLayoutMobile";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const FloatingAssistantDock = React.lazy(() => import("./FloatingAssistantDock"));

const AppLayout: React.FC = () => {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  if (isMobile) return <AppLayoutMobile />;

  const isDocsShell = pathname === "/docs" || pathname.startsWith("/docs/");
  const isBastionShell = pathname === "/cluster/bastion" || pathname === "/cluster/bastion/";
  const isDocsEditorViewport =
    pathname === "/docs" ||
    pathname.startsWith("/docs/doc/") ||
    pathname === "/docs/guides" ||
    pathname.startsWith("/docs/guides/doc/");
  const isBastionFullBleed =
    pathname === "/cluster/bastion/session" ||
    pathname.startsWith("/cluster/bastion/session/") ||
    pathname.startsWith("/cluster/bastion/console/");
  const isPodTerminalShell = /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal\/?$/.test(pathname);
  const hideAppChrome = isPodTerminalShell || isBastionFullBleed;
  const appChromeDark = isBastionShell && !hideAppChrome;

  return (
    <div
      data-cmp="AppLayout"
      className={cn(
        "flex h-screen min-h-0 w-full min-w-0 flex-col overflow-hidden font-sans",
        appChromeDark ? "bg-[#0c0f14]" : "bg-[#F1F5F9]"
      )}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 overflow-hidden",
          appChromeDark ? "bg-[#0c0f14] shadow-none" : "bg-white shadow-custom"
        )}
      >
        {!(isDocsShell || isBastionShell) && !hideAppChrome ? <Sidebar /> : null}

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            appChromeDark ? "bg-[#0c0f14]" : "bg-white"
          )}
        >
          {!hideAppChrome ? <Header tone={appChromeDark ? "dark" : "light"} /> : null}
          {!hideAppChrome ? <PlatformVersionBanner /> : null}
          {!hideAppChrome ? <RedisStatusBanner /> : null}
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              appChromeDark || isPodTerminalShell || isBastionFullBleed ? "bg-[#0c0f14]" : "bg-white"
            )}
          >
            <div
              className={cn(
                "app-main-scroll flex min-h-0 flex-1 flex-col overflow-x-hidden",
                isBastionFullBleed || isPodTerminalShell
                  ? "min-h-0 overflow-hidden p-0"
                  : isDocsEditorViewport
                    ? "min-h-0 overflow-hidden p-0"
                    : isDocsShell || isBastionShell
                      ? "overflow-y-auto p-0"
                      : "overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 md:px-6 md:py-6 lg:px-8 lg:py-8"
              )}
            >
              <div
                className={cn(
                  "mx-auto w-full min-w-0 flex-1",
                  isBastionFullBleed || isPodTerminalShell
                    ? "flex h-full min-h-0 max-w-none flex-col overflow-hidden"
                    : isDocsEditorViewport
                      ? "flex h-full min-h-0 max-w-none flex-col overflow-hidden"
                      : isDocsShell || isBastionShell
                        ? "max-w-none"
                        : "max-w-[min(100%,1920px)]"
                )}
              >
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>
      <React.Suspense fallback={null}>
        <FloatingAssistantDock tone={appChromeDark ? "dark" : "light"} />
      </React.Suspense>
    </div>
  );
};

export default AppLayout;
