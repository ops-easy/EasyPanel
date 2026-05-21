import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import RedisStatusBanner from "@/features/app-center/redis/components/RedisStatusBanner";
import PlatformVersionBanner from "./PlatformVersionBanner";
import AppLayoutMobile from "./AppLayoutMobile";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const UserGuideSheet = React.lazy(() => import("./UserGuideSheet"));

const AppLayout: React.FC = () => {
  const isMobile = useIsMobile();
  const { pathname } = useLocation();

  if (isMobile) return <AppLayoutMobile />;

  const isDocsShell = pathname === "/docs" || pathname.startsWith("/docs/");
  const isDocsEditorViewport =
    pathname === "/docs" ||
    pathname.startsWith("/docs/doc/") ||
    pathname === "/docs/guides" ||
    pathname.startsWith("/docs/guides/doc/");
  const isBastionFullBleed =
    pathname === "/cluster/bastion" ||
    pathname.startsWith("/cluster/bastion/") ||
    pathname === "/cluster/vcenter/bastion" ||
    pathname.startsWith("/cluster/vcenter/bastion/");
  const isPodTerminalShell = /\/cluster\/ns\/[^/]+\/pods\/[^/]+\/terminal\/?$/.test(pathname);
  const hideAppChrome = isPodTerminalShell || isBastionFullBleed;

  return (
    <div
      data-cmp="AppLayout"
      className="flex h-screen min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#F1F5F9] font-sans"
    >
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-white shadow-custom">
        {!isDocsShell && !hideAppChrome ? <Sidebar /> : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          {!hideAppChrome ? <Header /> : null}
          {!hideAppChrome ? <PlatformVersionBanner /> : null}
          {!hideAppChrome ? <RedisStatusBanner /> : null}
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden bg-white",
              (isPodTerminalShell || isBastionFullBleed) && "bg-[#0c0f14]"
            )}
          >
            <div
              className={cn(
                "app-main-scroll flex min-h-0 flex-1 flex-col overflow-x-hidden",
                isBastionFullBleed || isPodTerminalShell
                  ? "min-h-0 overflow-hidden p-0"
                  : isDocsEditorViewport
                    ? "min-h-0 overflow-hidden p-0"
                    : isDocsShell
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
                      : isDocsShell
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
        <UserGuideSheet />
      </React.Suspense>
    </div>
  );
};

export default AppLayout;
