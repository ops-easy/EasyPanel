import type { ReactNode } from "react";

export function AIProviderConfigPanel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">AI Provider / 对话接口</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        默认模型端点、密钥、模型参数和巡检摘要提示词集中在这里配置。
      </p>
      {children}
    </section>
  );
}
