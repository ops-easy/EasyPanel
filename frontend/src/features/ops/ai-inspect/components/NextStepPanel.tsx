import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { AiInspectNavItem } from "@/features/ops/ai-inspect/aiInspectNavigation";

export type NextStepAction = {
  item: AiInspectNavItem;
  note: string;
  adminOnly?: boolean;
};

export function NextStepPanel({ actions, isAdmin }: { actions: NextStepAction[]; isAdmin: boolean }) {
  const visibleActions = actions.filter((action) => !action.adminOnly || isAdmin);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">下一步动作</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        按排障路径排列：先看监控，再确认告警，随后进入日志或巡检输出。
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleActions.map(({ item, note }) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              to={item.to}
              className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 transition hover:border-cyan-200 hover:bg-cyan-50/40"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-700 shadow-sm">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">{note}</span>
              </span>
              <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-600" aria-hidden />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
