import type { ReactNode } from "react";

export function ProviderScenarioOverridesPanel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-violet-200/80 bg-gradient-to-b from-violet-50/40 to-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">分场景 AI Provider（可选）</h2>
      <p className="mt-1 text-sm text-slate-600">
        下列能力默认走上方「AI Provider / 对话接口」；需要不同应用中心实例或远端模型时，在对应折叠中开启并填写。
      </p>
      {children}
    </section>
  );
}
