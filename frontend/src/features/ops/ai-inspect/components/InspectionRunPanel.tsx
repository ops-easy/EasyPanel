import type { ReactNode } from "react";

export function InspectionRunPanel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4">
      <h3 className="text-sm font-semibold text-slate-900">保存与执行</h3>
      {children}
    </div>
  );
}
