import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Bot, Loader2, Send, Settings, Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/auth/auth-context";
import { OpenClawChatMarkdown } from "@/features/app-center/openclaw/components/OpenClawChatMarkdown";
import { apiGetJson, apiPostJson, ApiHttpError } from "@/lib/api";
import { describeSitePath } from "@/lib/site-path-descriptions";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Textarea } from "@/shared/ui/textarea";

const AI_CHAT_STORAGE_KEY = "kubebt-ai-chat:v1";

type AIChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AIChatStatus = {
  ready: boolean;
  enabled: boolean;
  provider: string;
  source: string;
  model: string;
  message: string;
};

type AIChatResponse = {
  message: string;
  provider?: string;
  source?: string;
  model?: string;
  latencyMs?: number;
};

type AIChatSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function loadAIChatMessages(): AIChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AI_CHAT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AIChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AIChatMessage =>
        item != null &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string" &&
        item.content.trim() !== ""
      )
      .slice(-20);
  } catch {
    return [];
  }
}

function saveAIChatMessages(messages: AIChatMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AI_CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
  } catch {
    /* ignore */
  }
}

function aiChatErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) return error.serverMessage || "AI 对话失败";
  if (error instanceof Error) return error.message;
  return "AI 对话失败";
}

function providerLabel(status?: AIChatStatus): string {
  const provider = (status?.provider || "custom").toLowerCase();
  if (provider === "openclaw") return "OpenClaw";
  if (provider === "hermes") return "Hermes";
  return "OpenAI 兼容";
}

export default function AIChatSheet({ open, onOpenChange }: AIChatSheetProps) {
  const location = useLocation();
  const { status: authStatus } = useAuth();
  const isAdmin = authStatus?.role === "admin";
  const [messages, setMessages] = useState<AIChatMessage[]>(() => loadAIChatMessages());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const viewportRef = useRef<HTMLDivElement>(null);

  const routePath = useMemo(
    () => `${location.pathname}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  );
  const routeDescription = useMemo(() => describeSitePath(routePath), [routePath]);

  const statusQ = useQuery({
    queryKey: ["ops-ai-chat-status"],
    queryFn: ({ signal }) => apiGetJson<AIChatStatus>("/api/ops/ai-chat/status", { signal }),
    enabled: open,
    staleTime: 20_000,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    setMessages(loadAIChatMessages());
    setSendError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  const clearMessages = () => {
    setMessages([]);
    saveAIChatMessages([]);
    setSendError("");
  };

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || sending || statusQ.data?.ready === false) return;
    const userMessage: AIChatMessage = { role: "user", content };
    const next: AIChatMessage[] = [...messages, userMessage].slice(-20);
    setMessages(next);
    saveAIChatMessages(next);
    setDraft("");
    setSendError("");
    setSending(true);
    try {
      const pageTitle = typeof document === "undefined" ? "" : document.title;
      const res = await apiPostJson<AIChatResponse>("/api/ops/ai-chat", {
        messages: next,
        routePath,
        routeDescription,
        pageTitle,
      });
      const merged = [...next, { role: "assistant" as const, content: res.message || "（空回复）" }].slice(-20);
      setMessages(merged);
      saveAIChatMessages(merged);
    } catch (error) {
      setSendError(aiChatErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const notReady = Boolean(statusQ.data && !statusQ.data.ready);
  const canSend = draft.trim() !== "" && !sending && !notReady;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl md:max-w-2xl"
      >
        <SheetHeader className="shrink-0 space-y-2 border-b border-slate-100 bg-slate-50/90 px-6 py-4 text-left">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5 text-sky-700" aria-hidden />
                AI 对话
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-relaxed">
                全局平台运维助手，复用当前 AI Provider 配置。
              </SheetDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2 text-xs" onClick={clearMessages}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              清空
            </Button>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-medium",
                  statusQ.isLoading
                    ? "bg-slate-100 text-slate-600"
                    : statusQ.data?.ready
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                )}
              >
                {statusQ.isLoading ? "检查中" : statusQ.data?.ready ? "已就绪" : "未就绪"}
              </span>
              <span>{statusQ.data ? providerLabel(statusQ.data) : "AI Provider"}</span>
              {statusQ.data?.model ? <span className="font-mono text-[11px] text-slate-500">{statusQ.data.model}</span> : null}
              <span className="min-w-0 truncate text-slate-500">{routeDescription}</span>
            </div>
            {statusQ.data?.message ? <p className="mt-1 text-[11px] text-slate-500">{statusQ.data.message}</p> : null}
            {notReady ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-800">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                {isAdmin ? (
                  <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
                    <Link to="/cluster/ai-inspect/configure" onClick={() => onOpenChange(false)}>
                      <Settings className="h-3.5 w-3.5" aria-hidden />
                      打开 AI 配置
                    </Link>
                  </Button>
                ) : (
                  <span>请联系管理员启用 AI Provider。</span>
                )}
              </div>
            ) : null}
          </div>
        </SheetHeader>

        <div ref={viewportRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white px-6 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
              <Bot className="h-8 w-8 text-slate-300" aria-hidden />
              <p className="max-w-sm">可以问平台巡检、Kubernetes 排障、OpenClaw / Hermes 接入、网络和文档中心相关问题。</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isUser = msg.role === "user";
              return (
                <div key={`${msg.role}-${index}`} className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
                  {!isUser ? (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                      <Bot className="h-4 w-4" aria-hidden />
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed shadow-sm",
                      isUser ? "bg-sky-600 text-white" : "border border-slate-200 bg-slate-50 text-slate-800"
                    )}
                  >
                    {isUser ? (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    ) : (
                      <OpenClawChatMarkdown source={msg.content} />
                    )}
                  </div>
                  {isUser ? (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <UserRound className="h-4 w-4" aria-hidden />
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
          {sending ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              正在生成回复...
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          {sendError ? (
            <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{sendError}</p>
          ) : null}
          <div className="flex gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="输入问题，Ctrl/⌘ + Enter 发送"
              className="min-h-20 resize-none bg-white text-sm"
              disabled={sending || notReady}
            />
            <Button type="button" size="icon-lg" className="mt-auto" onClick={() => void sendMessage()} disabled={!canSend}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              <span className="sr-only">发送</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
