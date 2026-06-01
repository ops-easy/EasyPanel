import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Button } from "@/shared/ui/button";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white px-6 py-7 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
          <SearchX className="h-6 w-6" aria-hidden />
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-slate-500">404 / Route not found</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">这个页面不在当前平台路由里</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">
          可能是旧入口、权限菜单已调整，或当前模块路径已经迁移。你可以回到工作台重新进入对应模块。
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/">
              <Home className="mr-1.5 h-4 w-4" aria-hidden />
              返回工作台
            </Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
            回到上一页
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
