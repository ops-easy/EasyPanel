import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import type { NetworkChangePreview } from "@/features/network/model/networkTypes";

export function RouterChangePreviewPanel({ preview }: { preview?: NetworkChangePreview }) {
  if (!preview) {
    return (
      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-500">
        先生成预览，确认将要执行的命令或 iKuai HTTP 请求后再应用。
      </section>
    );
  }

  const commands = preview.commands ?? [];
  const requests = preview.requests ?? [];
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">变更预览</h3>
          <p className="mt-1 text-xs text-slate-500">{preview.requiresConfirmation ? "需要显式确认后才能应用。" : "预览已生成。"}</p>
        </div>
        <Badge variant="outline" className="gap-1 bg-white text-slate-600">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {preview.capability || "dry-run"}
        </Badge>
      </div>

      {commands.length ? (
        <div className="mt-3 grid gap-2">
          {commands.map((command, index) => (
            <code key={`${command}:${index}`} className="block overflow-auto rounded-md bg-slate-950 px-3 py-2 text-xs text-slate-50">
              {command}
            </code>
          ))}
        </div>
      ) : null}

      {requests.length ? (
        <div className="mt-3 grid gap-2">
          {requests.map((request, index) => (
            <div key={`${request.func_name}:${request.action}:${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-950">{request.func_name || "iKuai API"}</span>
              <span className="mx-2 text-slate-300">/</span>
              <span className="text-slate-600">{request.action || "request"}</span>
            </div>
          ))}
        </div>
      ) : null}

      {preview.warnings?.length ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{preview.warnings.join("；")}</p>
        </div>
      ) : null}

      {preview.unsupported?.length ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">暂不支持：{preview.unsupported.join("、")}</p>
      ) : null}
    </section>
  );
}
