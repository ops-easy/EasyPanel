import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("desktop layout mounts a shared floating assistant dock", () => {
  const appLayout = read("../src/shared/layout/AppLayout.tsx");
  const dock = read("../src/shared/layout/FloatingAssistantDock.tsx");

  assert.match(appLayout, /FloatingAssistantDock/);
  assert.match(dock, /UserGuideSheet/);
  assert.match(dock, /AIChatSheet/);
  assert.match(dock, /aria-label="打开 AI 对话"/);
  assert.match(dock, /aria-label="打开使用文档"/);
});

test("AI chat sheet uses provider-neutral chat API and local history", () => {
  const chat = read("../src/shared/layout/AIChatSheet.tsx");

  assert.match(chat, /\/api\/ops\/ai-chat\/status/);
  assert.match(chat, /\/api\/ops\/ai-chat\/stream/);
  assert.match(chat, /\/api\/ops\/ai-chat"/);
  assert.doesNotMatch(chat, /\/api\/ops\/ai-provider/);
  assert.match(chat, /describeSitePath/);
  assert.match(chat, /OpenClawChatMarkdown/);
  assert.match(chat, /localStorage/);
  assert.match(chat, /routeDescription/);
  assert.match(chat, /pageTitle/);
});

test("AI chat sheet streams responses with abort and non-stream fallback", () => {
  const chat = read("../src/shared/layout/AIChatSheet.tsx");

  assert.match(chat, /new AbortController\(\)/);
  assert.match(chat, /ReadableStream/);
  assert.match(chat, /stopStreaming/);
  assert.match(chat, /streamAIChat/);
  assert.match(chat, /fallbackAIChat/);
  assert.match(chat, /apiPostJson<AIChatResponse>\("\/api\/ops\/ai-chat"/);
});

test("user guide sheet keeps guide API but no longer owns the floating button", () => {
  const guide = read("../src/shared/layout/UserGuideSheet.tsx");

  assert.match(guide, /\/api\/docs\/guides\/resolve\?path=/);
  assert.match(guide, /OpenClawChatMarkdown/);
  assert.doesNotMatch(guide, /createPortal/);
  assert.doesNotMatch(guide, /fixed bottom-5 right-5/);
  assert.doesNotMatch(guide, /aria-label="打开使用文档"/);
});
