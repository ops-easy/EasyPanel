import type { ReactNode } from "react";

export function SshInstallTaskPanel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">SSH 安装与目标状态</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          管理员可直接下发后台安装任务；普通用户仍可复制脚本手动执行。
        </p>
      </div>
      {children}
    </section>
  );
}
