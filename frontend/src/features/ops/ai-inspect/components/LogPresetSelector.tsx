import type { ReactNode } from "react";

export function LogPresetSelector({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">采集预设</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          选择日志路径、目标标签和 VictoriaLogs 地址，先确定要采什么。
        </p>
      </div>
      {children}
    </section>
  );
}
