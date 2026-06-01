import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { apiGetJson, type SetupStatus } from "@/lib/api";
import { extractErrorMessage } from "@/lib/extract-error-message";
import { Button } from "@/shared/ui/button";

/** 静态配置未完成时强制进入 /setup；完成后禁止访问 /setup。 */
const SetupGate: React.FC = () => {
  const loc = useLocation();
  const q = useQuery({
    queryKey: ["setup-status"],
    queryFn: ({ signal }) => apiGetJson<SetupStatus>("/api/setup/status", { signal }),
    staleTime: 10_000,
    retry: 2,
  });

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans text-sm text-slate-600">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
          正在读取初始化状态…
        </div>
      </div>
    );
  }

  if (q.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-sans">
        <div
          role="alert"
          className="w-full max-w-xl rounded-lg border border-amber-200 bg-white px-6 py-6 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-amber-950">无法读取初始化状态</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                平台初始化接口暂不可用。为避免误进入未完成配置的系统，当前访问先停在安全检查页。
              </p>
              <p className="mt-3 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {extractErrorMessage(q.error)}
              </p>
              <Button type="button" className="mt-4" variant="outline" onClick={() => void q.refetch()}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                重新检查初始化状态
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const data = q.data;
  if (data && !data.initialized && loc.pathname !== "/setup") {
    return <Navigate to="/setup" replace />;
  }
  if (data?.initialized && loc.pathname === "/setup") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};

export default SetupGate;
