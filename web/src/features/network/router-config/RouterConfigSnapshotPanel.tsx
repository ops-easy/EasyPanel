import { Loader2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { formatDateTime } from "@/features/network/components/NetworkOpsPrimitives";
import type { NetworkConfigSnapshot } from "@/features/network/model/networkTypes";

export function RouterConfigSnapshotPanel({
  snapshot,
  loading,
}: {
  snapshot?: NetworkConfigSnapshot;
  loading?: boolean;
}) {
  const count = snapshot?.sections?.length ?? 0;
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-950">当前配置快照</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {snapshot?.checkedAt ? `读取时间：${formatDateTime(snapshot.checkedAt)}` : "打开抽屉后读取当前路由器配置。"}
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        ) : (
          <Badge variant="outline" className="bg-white text-slate-600">
            {snapshot?.capability || snapshot?.source || "snapshot"}
          </Badge>
        )}
      </div>

      {snapshot?.errors?.length ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {snapshot.errors.join("；")}
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {count > 0 ? `已读取 ${count} 条结构化配置项，可用于变更前核对。` : "暂无结构化配置项，可切换高级模式使用原生命令/接口兜底。"}
        </p>
      )}
    </section>
  );
}
