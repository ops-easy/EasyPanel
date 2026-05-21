import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock3,
  History,
  Loader2,
  Network,
  Play,
  RefreshCw,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { apiGetJson, apiPostJson, apiPutJson } from "@/lib/api";
import { formatDateTimeShanghai } from "@/lib/datetime-cn";

type IpScanConfig = { segments: string[] };

type IpScanResultRow = { ip: string; status: string };

type IpScanRun = {
  id: string;
  startedAt: string;
  endedAt: string;
  segment: string;
  podSourceIp?: string;
  results: IpScanResultRow[];
  summary: { total: number; used: number; likelyFree: number };
  note?: string;
};

const formatTimeRange = (run: IpScanRun) =>
  `${formatDateTimeShanghai(run.startedAt)} - ${formatDateTimeShanghai(run.endedAt)}`;

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  if (status === "used") {
    return (
      <Badge className="border-amber-300 bg-amber-50 font-normal text-amber-900 hover:bg-amber-50">
        疑似占用
      </Badge>
    );
  }

  return (
    <Badge className="border-sky-300 bg-sky-50 font-normal text-sky-900 hover:bg-sky-50">
      疑似空闲
    </Badge>
  );
};

const MetricTile: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: "slate" | "amber" | "sky" | "emerald";
}> = ({ label, value, tone = "slate" }) => {
  const toneClass =
    tone === "amber"
      ? "text-amber-800"
      : tone === "sky"
        ? "text-sky-800"
        : tone === "emerald"
          ? "text-emerald-800"
          : "text-slate-950";

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
};

const RunResultPanel: React.FC<{ run: IpScanRun; mode: "current" | "latest" }> = ({
  run,
  mode,
}) => {
  const rows = run.results.slice(0, 256);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950">
                {mode === "current" ? "本次扫描结果" : "最近扫描结果"}
              </h2>
              <Badge
                variant="outline"
                className={
                  mode === "current"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }
              >
                {run.segment}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Pod 源 IP{" "}
              <span className="font-mono text-slate-700">{run.podSourceIp || "-"}</span> ·{" "}
              {formatTimeRange(run)}
            </p>
          </div>
          <Badge className="border-slate-200 bg-slate-50 font-normal text-slate-700 hover:bg-slate-50">
            共 {run.summary.total} 个地址
          </Badge>
        </div>
        {run.note ? <p className="mt-2 text-xs leading-5 text-slate-500">{run.note}</p> : null}
      </div>

      <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
        <MetricTile label="总计" value={run.summary.total} />
        <MetricTile label="疑似占用" value={run.summary.used} tone="amber" />
        <MetricTile label="疑似空闲" value={run.summary.likelyFree} tone="sky" />
      </div>

      <div className="max-h-[430px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-slate-50">
            <TableRow>
              <TableHead>IP</TableHead>
              <TableHead className="w-40">状态</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.ip}>
                <TableCell className="font-mono text-xs text-slate-900">{row.ip}</TableCell>
                <TableCell>
                  <StatusBadge status={row.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {run.results.length > 256 ? (
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          仅显示前 256 行，完整数据请查看接口返回。
        </p>
      ) : null}
    </section>
  );
};

const ToolNetworkIpScan: React.FC = () => {
  const qc = useQueryClient();
  const [segmentInput, setSegmentInput] = useState("");
  const [oneoffSeg, setOneoffSeg] = useState("");

  const configQ = useQuery({
    queryKey: ["toolbox-ip-scan-config"],
    queryFn: ({ signal }) => apiGetJson<IpScanConfig>("/api/toolbox/ip-scan/config", { signal }),
  });

  const historyQ = useQuery({
    queryKey: ["toolbox-ip-scan-history"],
    queryFn: ({ signal }) =>
      apiGetJson<{ runs: IpScanRun[] }>("/api/toolbox/ip-scan/history", { signal }),
  });

  const segmentsHydrated = React.useRef(false);
  React.useEffect(() => {
    const segs = configQ.data?.segments;
    if (segmentsHydrated.current || !segs?.length) return;
    setSegmentInput(segs.join("\n"));
    segmentsHydrated.current = true;
  }, [configQ.data?.segments]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const segments = segmentInput
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return apiPutJson<IpScanConfig>("/api/toolbox/ip-scan/config", { segments });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["toolbox-ip-scan-config"] });
      toast.success("网段已保存");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runMut = useMutation({
    mutationFn: async (segment?: string) =>
      apiPostJson<{ run: IpScanRun }>("/api/toolbox/ip-scan/run", {
        segment: segment?.trim() || "",
      }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["toolbox-ip-scan-history"] });
      const s = data.run.summary;
      toast.success(
        `扫描完成：共 ${s.total} 个地址，疑似占用 ${s.used}，疑似空闲 ${s.likelyFree}`
      );
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const runs = historyQ.data?.runs ?? [];
  const savedSegments = configQ.data?.segments ?? [];
  const lastRun = runs[0];
  const displayRun = runMut.data?.run ?? lastRun;
  const busy = saveMut.isPending || runMut.isPending;

  return (
    <div className="mx-auto w-full max-w-[min(100%,92rem)] space-y-5 pb-6">
      <section className="rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">
              内网工具箱
            </p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
              <Network className="h-6 w-6 text-cyan-600" />
              空闲 IP 探测
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              在控制台 Pod 内发起 TCP 连接探测常见端口。Pod 通常没有 ICMP
              权限，因此不使用 ping；如果目标防火墙直接丢包，结果会更偏保守地标为疑似空闲。
            </p>
          </div>
          <div className="grid gap-2 sm:min-w-[360px] sm:grid-cols-3">
            <MetricTile
              label="已保存网段"
              value={configQ.isLoading ? "..." : savedSegments.length}
              tone="emerald"
            />
            <MetricTile label="历史记录" value={historyQ.isLoading ? "..." : runs.length} />
            <MetricTile label="单次上限" value="512" tone="sky" />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-950">扫描队列</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  每行一个 IPv4 CIDR，例如{" "}
                  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">
                    10.20.0.0/24
                  </code>
                  。保存后可直接扫描首个网段。
                </p>
              </div>
              <Badge variant="outline">{savedSegments.length} 条</Badge>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="segments">网段列表</Label>
              <textarea
                id="segments"
                className="min-h-[150px] w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-900 shadow-xs outline-none transition-[color,box-shadow] placeholder:text-slate-400 focus-visible:border-cyan-500 focus-visible:ring-[3px] focus-visible:ring-cyan-500/20"
                value={segmentInput}
                onChange={(e) => setSegmentInput(e.target.value)}
                placeholder={"10.0.0.0/24\n10.0.1.0/24"}
              />
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Button
                type="button"
                disabled={busy}
                onClick={() => saveMut.mutate()}
                className="w-full cursor-pointer gap-2 bg-cyan-600 hover:bg-cyan-700"
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存网段
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => runMut.mutate(undefined)}
                className="w-full cursor-pointer gap-2"
              >
                {runMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                扫描首个已保存网段
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-950">单次扫描</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              临时指定一个 CIDR，不覆盖已保存列表。
            </p>
            <div className="mt-4 space-y-2">
              <Label htmlFor="oneoff">CIDR</Label>
              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col 2xl:flex-row">
                <Input
                  id="oneoff"
                  className="font-mono text-sm"
                  placeholder="192.168.1.0/24"
                  value={oneoffSeg}
                  onChange={(e) => setOneoffSeg(e.target.value)}
                />
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const v = oneoffSeg.trim();
                    if (!v) {
                      toast.error("请填写 CIDR");
                      return;
                    }
                    runMut.mutate(v);
                  }}
                  className="cursor-pointer gap-2 sm:shrink-0 xl:w-full 2xl:w-auto"
                >
                  {runMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  扫描
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 text-amber-950">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">结果判定说明</h2>
                <p className="mt-1 text-xs leading-5 text-amber-900">
                  TCP 连接成功或收到拒绝会标为疑似占用；超时或无响应会标为疑似空闲。它适合排查候选地址，不等同于最终 IPAM 分配状态。
                </p>
              </div>
            </div>
          </section>
        </aside>

        <main className="min-w-0 space-y-4">
          {displayRun ? (
            <RunResultPanel run={displayRun} mode={runMut.data?.run ? "current" : "latest"} />
          ) : (
            <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-6">
              <div className="flex gap-3">
                <Play className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">等待扫描结果</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    保存网段后扫描首个网段，或在左侧输入 CIDR 立即执行一次临时扫描。
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-slate-500" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">历史记录</h2>
                  <p className="mt-0.5 text-xs text-slate-500">最多保留最近 80 次扫描。</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void historyQ.refetch()}
                className="w-fit cursor-pointer gap-1.5"
              >
                {historyQ.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                刷新
              </Button>
            </div>

            {historyQ.isLoading ? (
              <p className="px-4 py-5 text-sm text-slate-500">加载中...</p>
            ) : runs.length === 0 ? (
              <p className="px-4 py-5 text-sm text-slate-500">
                暂无记录，保存网段并执行扫描后会保留在此。
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <details key={run.id} className="group px-4 py-3">
                    <summary className="flex cursor-pointer list-none flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs font-semibold text-slate-950">
                          {run.segment}
                        </span>
                        <span className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDateTimeShanghai(run.startedAt)}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge className="border-amber-300 bg-amber-50 font-normal text-amber-900 hover:bg-amber-50">
                          占用 {run.summary.used}
                        </Badge>
                        <Badge className="border-sky-300 bg-sky-50 font-normal text-sky-900 hover:bg-sky-50">
                          空闲 {run.summary.likelyFree}
                        </Badge>
                      </span>
                    </summary>
                    <div className="mt-3 max-h-[260px] overflow-auto rounded-lg border border-slate-100">
                      <Table>
                        <TableHeader className="sticky top-0 bg-slate-50">
                          <TableRow>
                            <TableHead className="text-xs">IP</TableHead>
                            <TableHead className="w-40 text-xs">状态</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {run.results.slice(0, 256).map((row) => (
                            <TableRow key={`${run.id}-${row.ip}`}>
                              <TableCell className="font-mono text-xs text-slate-900">
                                {row.ip}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={row.status} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {run.results.length > 256 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        仅显示前 256 行，完整数据请查看接口返回。
                      </p>
                    ) : null}
                  </details>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

export default ToolNetworkIpScan;
