import type { ReactNode } from "react";

export function OpenSearchDualWritePanel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2.5 md:col-span-2">
      <h3 className="text-[11px] font-medium text-indigo-950">OpenSearch 双写（可选，Vector elasticsearch/opensearch sink）</h3>
      {children}
    </section>
  );
}
