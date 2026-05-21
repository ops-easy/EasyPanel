import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, BookOpen, Loader2 } from "lucide-react";
import { OpenClawChatMarkdown } from "@/features/app-center/openclaw/components/OpenClawChatMarkdown";
import { ApiHttpError, apiGetJson } from "@/lib/api";
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
    updatedAt?: string;
  };
};

function guideErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) return error.serverMessage || "当前页面暂无指南";
  if (error instanceof Error) return error.message;
  return "当前页面暂无指南";
}

export default function UserGuideSheet() {
  const location = useLocation();
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

  const fab = (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => setOpen(true)}
      className="pointer-events-auto fixed bottom-5 right-5 z-[60] h-12 w-12 rounded-full border border-slate-200/90 bg-white shadow-lg ring-1 ring-black/5 hover:bg-slate-50 md:bottom-6 md:right-6"
      aria-label="打开使用文档"
      title="使用文档"
    >
      <BookOpen className="h-5 w-5 text-slate-700" />
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
