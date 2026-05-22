import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, ExternalLink, FileText, Loader2 } from "lucide-react";
import { OpenClawChatMarkdown } from "@/features/app-center/openclaw/components/OpenClawChatMarkdown";
import { ApiHttpError, apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";

type GuideResolveResponse = {
  matched?: boolean;
  fallback?: boolean;
  path?: string;
  guide?: {
    guideKey: string;
    routePattern: string;
    matchType: string;
    docId: number;
    enabled: boolean;
    sortOrder?: number;
  };
  doc?: {
    id: number;
    title: string;
    bodyMarkdown: string;
    contentKind?: string;
    previewUrl?: string;
    updatedAt?: string;
  };
};

type UserGuideSheetProps = {
  tone?: "light" | "dark";
};

function guideErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) return error.serverMessage || "当前页面暂无指南";
  if (error instanceof Error) return error.message;
  return "当前页面暂无指南";
}

export default function UserGuideSheet({ tone = "light" }: UserGuideSheetProps) {
  const location = useLocation();
  const isDark = tone === "dark";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const routePath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  );

  const guideQ = useQuery({
    queryKey: ["page-guide", routePath],
    queryFn: ({ signal }) =>
      apiGetJson<GuideResolveResponse>(`/api/docs/guides/resolve?path=${encodeURIComponent(routePath)}`, { signal }),
    enabled: open,
    retry: false,
    staleTime: 30_000,
  });

  const doc = guideQ.data?.doc;
  const guide = guideQ.data?.guide;
  const title = doc?.title || "使用文档";
  const routeLabel = guide
    ? `${guide.matchType}:${guide.routePattern}`
    : routePath;
  const guideDocHref = doc ? `/docs/guides/doc/${doc.id}` : "";
  const previewHref = doc ? doc.previewUrl || `/r/${doc.id}.html` : "";

  const fab = (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => setOpen(true)}
      className={cn(
        "pointer-events-auto fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full border shadow-lg ring-1 md:bottom-6 md:right-6",
        isDark ? "border-slate-800 bg-slate-900 text-slate-100 ring-white/10 hover:bg-slate-800" : "border-slate-200/90 bg-white ring-black/5 hover:bg-slate-50"
      )}
      aria-label="打开使用文档"
      title="使用文档"
    >
      <BookOpen className={cn("h-5 w-5", isDark ? "text-slate-200" : "text-slate-700")} />
    </Button>
  );

  return (
    <>
      {mounted && !open && typeof document !== "undefined" ? createPortal(fab, document.body) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex h-full w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl"
        >
          <SheetHeader className="shrink-0 space-y-2 border-b border-slate-100 bg-slate-50/90 px-6 py-4 text-left">
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{title}</SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-relaxed">
                {guideQ.isLoading
                  ? "正在根据当前页面加载指南。"
                  : guideQ.data?.fallback
                    ? "当前页面未配置专属指南，显示全局指南。"
                    : `当前页面指南：${routeLabel}`}
              </SheetDescription>
              {guide || doc ? (
                <div className="mt-3 flex flex-col gap-3 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600">
                  <div className="grid min-w-0 gap-1.5">
                    {guide ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-medium text-slate-500">guideKey</span>
                        <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                          {guide.guideKey}
                        </code>
                      </div>
                    ) : null}
                    {doc ? (
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-medium text-slate-500">文档来源</span>
                        <span className="truncate text-slate-700">
                          {doc.title} · #{doc.id}
                        </span>
                      </div>
                    ) : null}
                    {guide ? (
                      <div className="truncate text-slate-500">
                        命中规则：{guide.matchType}:{guide.routePattern}
                        {guideQ.data?.fallback ? " · 全局兜底" : ""}
                      </div>
                    ) : null}
                  </div>
                  {doc ? (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
                        <Link to={guideDocHref} onClick={() => setOpen(false)}>
                          <FileText className="h-3.5 w-3.5" aria-hidden />
                          打开文档
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" asChild>
                        <a href={previewHref} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          预览页
                        </a>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 text-sm leading-relaxed text-slate-700">
            {guideQ.isLoading || (guideQ.isFetching && !doc) ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                <p>加载页面指南中...</p>
              </div>
            ) : guideQ.isError ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center text-slate-500">
                <AlertCircle className="h-7 w-7 text-amber-500" aria-hidden />
                <p className="max-w-sm text-sm">{guideErrorMessage(guideQ.error)}</p>
              </div>
            ) : doc ? (
              <div className="markdown-body max-w-none">
                {String(doc.contentKind ?? "markdown").toLowerCase() === "markdown" ? (
                  <OpenClawChatMarkdown source={doc.bodyMarkdown || ""} />
                ) : (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    当前指南不是 Markdown 文档，请在文档中心调整为 Markdown 后再展示。
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
