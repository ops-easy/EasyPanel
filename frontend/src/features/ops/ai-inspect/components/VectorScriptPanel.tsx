import type { ReactNode } from "react";

export function VectorScriptPanel({ children }: { children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">脚本与 Vector 配置</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          生成结果会同时给出下载地址、Bash 安装脚本和 Vector TOML 参考配置。
        </p>
      </div>
      {children}
    </section>
  );
}
