import { Suspense, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export const routeChunkFallback = (
  <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-sm text-slate-500">
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
      <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
    </span>
    <span>加载模块中…</span>
  </div>
);

export function RouteSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={routeChunkFallback}>{children}</Suspense>;
}
