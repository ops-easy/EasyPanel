import type { ReactNode } from "react";

export function InspectionSchedulePanel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <h3 className="text-sm font-semibold text-slate-900">定时报表</h3>
      {children}
    </div>
  );
}
