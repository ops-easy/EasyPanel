import { Suspense, type ReactNode } from "react";

export const routeChunkFallback = (
  <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-sm text-slate-500">
    加载模块中...
  </div>
);

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={routeChunkFallback}>{children}</Suspense>;
}
