import type { ReactNode } from "react";

export function LogIngestionVerificationPanel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-900">入库验证</h3>
      {children}
    </section>
  );
}
