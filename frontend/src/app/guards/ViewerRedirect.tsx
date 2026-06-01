import React from "react";
import { Link, Navigate } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { useAppConfig } from "@/hooks/use-app-config";
import { Button } from "@/shared/ui/button";

type Props = {
  /** 只读账号跳转目标 */
  to: string;
  children: React.ReactNode;
};

/** 仅非 viewer 可访问子页面（宝塔、公有云主机等） */
const ViewerRedirect: React.FC<Props> = ({ to, children }) => {
  const q = useAppConfig();
  const auth = useAuth();
  const role = auth.status?.role?.toLowerCase();

  if (q.isPending || q.isLoading || auth.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-600">
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden />
          正在校验当前账号权限…
        </div>
      </div>
    );
  }

  if (role === "viewer") {
    return <Navigate to={to} replace />;
  }

  if (q.isError) {
    if (role === "admin") {
      return <>{children}</>;
    }
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-lg border border-amber-200 bg-white px-5 py-5 text-sm text-slate-700 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-amber-950">无法校验当前账号权限</p>
            <p className="mt-2 leading-relaxed">
              平台配置接口返回异常。为避免只读账号进入敏感页面，已暂时阻止访问当前页面。
            </p>
            <p className="mt-3 break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
              {(q.error as Error).message}
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link to={to}>
                <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
                返回安全入口
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (q.data?.dashboardRole === "viewer" || q.data?.viewer) {
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
};

export default ViewerRedirect;
