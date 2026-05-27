import type { ReactNode } from "react";

export function InspectionScopePanel({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">巡检范围与每日报告</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">
        勾选本次要纳入报告的数据域，并设置每日自动巡检的执行时间。
      </p>
      {children}
    </section>
  );
}
