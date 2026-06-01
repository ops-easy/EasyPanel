import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { Button } from "@/shared/ui/button";

const RequireAuth: React.FC = () => {
  const { status, loading, error } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 font-sans text-sm text-slate-600">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
          正在检查登录状态…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 font-sans">
        <div
          role="alert"
          className="w-full max-w-xl rounded-lg border border-rose-200 bg-white px-6 py-6 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-rose-950">无法加载登录状态</h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                平台认证接口暂不可用，当前页面不会继续进入受保护模块。请稍后重新检查，或确认网关到后端服务的连通性。
              </p>
              <p className="mt-3 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
                {error.message}
              </p>
              <Button type="button" className="mt-4" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                重新检查登录状态
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status?.authRequired && !status.loggedIn) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />;
  }

  return <Outlet />;
};

export default RequireAuth;
