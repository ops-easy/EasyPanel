import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Copy, Home, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";

type S = { error: Error | null };
type Props = { children: React.ReactNode; resetKey: string };

/**
 * 捕获子树渲染错误，避免整页白屏；刷新可恢复数据类问题。
 */
export class AppRouteBoundary extends React.Component<
  Props,
  S
> {
  state: S = { error: null };

  static getDerivedStateFromError(error: Error): S {
    return { error };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  private copyErrorMessage(message: string) {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(message).catch(() => undefined);
  }

  render() {
    if (this.state.error) {
      const msg = this.state.error.message || String(this.state.error);
      const detail = this.state.error.stack || msg;
      return (
        <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4 py-10">
          <div
            role="alert"
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-rose-200 bg-white shadow-sm"
          >
            <div className="border-b border-rose-100 bg-rose-50/80 px-6 py-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700">
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-rose-950">页面渲染出错</h2>
                  <p className="mt-1 text-sm leading-relaxed text-rose-900/80">
                    当前路由遇到前端边界错误。你可以先回到工作台继续处理其它模块，也可以复制错误信息用于排查。
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <pre className="max-h-44 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-100">
                {detail}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link to="/" onClick={() => this.setState({ error: null })}>
                    <Home className="mr-1.5 h-4 w-4" aria-hidden />
                    返回工作台
                  </Link>
                </Button>
                <Button type="button" variant="outline" onClick={() => this.setState({ error: null })}>
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />
                  重试当前页
                </Button>
                <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                  <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
                  刷新页面
                </Button>
                <Button type="button" variant="ghost" onClick={() => this.copyErrorMessage(detail)}>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden />
                  复制错误信息
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
