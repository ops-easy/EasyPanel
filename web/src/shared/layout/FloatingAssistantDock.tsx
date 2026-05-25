import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/button";
import AIChatSheet from "./AIChatSheet";
import UserGuideSheet from "./UserGuideSheet";

type FloatingAssistantDockProps = {
  tone?: "light" | "dark";
};

type FloatingPanel = "ai" | "guide";

export default function FloatingAssistantDock({ tone = "light" }: FloatingAssistantDockProps) {
  const [mounted, setMounted] = useState(false);
  const [activePanel, setActivePanel] = useState<FloatingPanel | null>(null);
  const isDark = tone === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePanel = (panel: FloatingPanel, open: boolean) => {
    setActivePanel(open ? panel : null);
  };

  const buttonClassName = (accent: "ai" | "guide") =>
    cn(
      "pointer-events-auto h-12 w-12 rounded-full border shadow-lg shadow-slate-950/10 ring-1 transition",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2",
      isDark
        ? accent === "ai"
          ? "border-sky-800/70 bg-slate-900 text-sky-100 ring-white/10 hover:bg-slate-800"
          : "border-slate-700 bg-slate-900 text-slate-100 ring-white/10 hover:bg-slate-800"
        : accent === "ai"
          ? "border-sky-200/90 bg-white text-sky-700 ring-black/5 hover:bg-sky-50"
          : "border-slate-200 bg-white text-slate-700 ring-black/5 hover:bg-slate-50"
    );

  const dock = (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="打开 AI 对话"
        title="AI 对话"
        className={buttonClassName("ai")}
        onClick={() => setActivePanel("ai")}
      >
        <Bot className="h-5 w-5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="打开使用文档"
        title="使用文档"
        className={buttonClassName("guide")}
        onClick={() => setActivePanel("guide")}
      >
        <BookOpen className="h-5 w-5" aria-hidden />
      </Button>
    </div>
  );

  return (
    <>
      {mounted && activePanel == null && typeof document !== "undefined" ? createPortal(dock, document.body) : null}
      <AIChatSheet open={activePanel === "ai"} onOpenChange={(open) => updatePanel("ai", open)} />
      <UserGuideSheet tone={tone} open={activePanel === "guide"} onOpenChange={(open) => updatePanel("guide", open)} />
    </>
  );
}
