import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { apiGetJson } from "@/lib/api";

type LogRow = { pod?: string; container?: string; log?: string; error?: string };
type EventRow = { type?: string; reason?: string; message?: string; object?: string; count?: number };

export default function HermesLogsEventsPanel({ instanceId }: { instanceId: string }) {
  const [tail, setTail] = useState(300);
  const logsQ = useQuery({
    queryKey: ["app-hermes-logs", instanceId, tail],
    queryFn: ({ signal }) => apiGetJson<{ logs: LogRow[] }>(`/api/app-center/hermes/instances/${encodeURIComponent(instanceId)}/logs?tail=${tail}`, { signal }),
    enabled: Boolean(instanceId),
    refetchInterval: false,
  });
  const eventsQ = useQuery({
    queryKey: ["app-hermes-events", instanceId],
    queryFn: ({ signal }) => apiGetJson<{ events: EventRow[] }>(`/api/app-center/hermes/instances/${encodeURIComponent(instanceId)}/events`, { signal }),
    enabled: Boolean(instanceId),
    refetchInterval: false,
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:col-span-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-fuchsia-700" />
          <h2 className="text-sm font-semibold text-slate-950">日志与事件</h2>
        </div>
        <div className="flex gap-2">
          {[100, 300, 1000].map((n) => (
            <Button key={n} size="sm" variant={tail === n ? "default" : "outline"} onClick={() => setTail(n)}>
              {n}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void logsQ.refetch();
              void eventsQ.refetch();
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">Pod Logs</h3>
          <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-950 p-3 text-xs leading-5 text-slate-50">
            {(logsQ.data?.logs ?? []).map((row) => [`# ${row.pod}/${row.container}`, row.error || row.log || ""].join("\n")).join("\n\n") || "暂无日志"}
          </pre>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-900">Events</h3>
          <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">
            {JSON.stringify(eventsQ.data?.events ?? [], null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
}
