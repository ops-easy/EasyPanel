import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Loader2 } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/shared/ui/chart";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useAppConfig } from "@/hooks/use-app-config";
import type { AppConfig } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  type ConcreteGpuPrometheusScope,
  type GpuPrometheusScope,
  matrixToChartRowsBySourceLabel,
  promInstantVector,
  promQueryGpuScopes,
  promQueryRangeGpuScopes,
} from "./vcenterPrometheusHelpers";

const chartUtil: ChartConfig = { v: { label: "利用率 %", color: "hsl(221 83% 53%)" } };
const chartTemp: ChartConfig = { v: { label: "温度 °C", color: "hsl(25 90% 48%)" } };
const chartPower: ChartConfig = { v: { label: "功耗 W", color: "hsl(142 71% 38%)" } };
const chartVram: ChartConfig = { v: { label: "显存 MiB", color: "hsl(262 70% 52%)" } };

function fmtAxisTime(iso: string): string {
  try {
    return format(new Date(iso), "M/d HH:mm", { locale: zhCN });
  } catch {
    return iso;
  }
}

/** 将 DCGM / nvidia_smi 的序列名本地化为「显卡 1」「显卡 2」等 */
function cnGpuLegend(raw: string): string {
  const [source, id] = raw.includes(" / ") ? raw.split(" / ", 2) : ["", raw];
  const prefix = source ? `${source} / ` : "";
  if (/^\d+$/.test(id)) return `${prefix}显卡 ${parseInt(id, 10) + 1}`;
  if (id.length > 14) return `${prefix}显卡 ${id.slice(0, 10)}…`;
  return `${prefix}显卡 ${id}`;
}

type GpuFamily = "dcgm" | "nvidia_smi" | "none";

function seriesKeys(rows: Record<string, string | number>[]): string[] {
  const k = new Set<string>();
  for (const row of rows) {
    for (const x of Object.keys(row)) {
      if (x !== "t") k.add(x);
    }
  }
  return Array.from(k).sort();
}

function hasSeriesData(rows: Record<string, string | number>[]): boolean {
  for (const row of rows) {
    for (const [key, val] of Object.entries(row)) {
      if (key === "t") continue;
      if (typeof val === "number" && Number.isFinite(val)) return true;
    }
  }
  return false;
}

const palette = [
  "hsl(221 83% 53%)",
  "hsl(262 70% 52%)",
  "hsl(142 71% 42%)",
  "hsl(25 90% 48%)",
  "hsl(350 70% 52%)",
  "hsl(199 72% 46%)",
];

function configuredGpuScopes(cfg?: AppConfig): ConcreteGpuPrometheusScope[] {
  if (!cfg) return [];
  const scopes: ConcreteGpuPrometheusScope[] = [];
  if (cfg.prometheusVcenterConfigured === true || cfg.prometheusConfigured === true) scopes.push("vcenter");
  if (cfg.prometheusPveConfigured === true || cfg.prometheusConfigured === true) scopes.push("pve");
  return scopes;
}

function gpuScopeHint(cfg: AppConfig | undefined, scope: ConcreteGpuPrometheusScope): string {
  if (!cfg) return scope;
  if (scope === "vcenter") return cfg.prometheusUrlVcenterHint || cfg.prometheusUrlHint || scope;
  return cfg.prometheusUrlPveHint || cfg.prometheusUrlHint || scope;
}

function dedupeGpuScopesByDatasource(
  scopes: ConcreteGpuPrometheusScope[],
  cfg?: AppConfig
): ConcreteGpuPrometheusScope[] {
  const seen = new Set<string>();
  const out: ConcreteGpuPrometheusScope[] = [];
  for (const scope of scopes) {
    const key = gpuScopeHint(cfg, scope);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(scope);
  }
  return out;
}

/** GPU 监控：可查 vCenter、PVE 或聚合数据源中的 DCGM / nvidia_smi 指标。 */
const VCenterGpuDashboard: React.FC = () => {
  const cfgQ = useAppConfig();
  const [range, setRange] = useState<"1h" | "6h" | "24h">("6h");
  const [source, setSource] = useState<GpuPrometheusScope>("all");

  const windowSec = range === "1h" ? 3600 : range === "6h" ? 6 * 3600 : 24 * 3600;
  const { endSec, startSec, step } = useMemo(() => {
    const end = Math.floor(Date.now() / 1000);
    const start = end - windowSec;
    const step = range === "24h" ? "120" : range === "6h" ? "60" : "30";
    return { endSec: end, startSec: start, step };
  }, [range, windowSec]);

  const availableScopes = useMemo(() => configuredGpuScopes(cfgQ.data), [cfgQ.data]);
  const activeScopes = useMemo(() => {
    const scopes = source === "all" ? availableScopes : availableScopes.filter((s) => s === source);
    return dedupeGpuScopesByDatasource(scopes, cfgQ.data);
  }, [availableScopes, cfgQ.data, source]);
  const activeScopeKey = activeScopes.join("|") || "none";

  const familyQ = useQuery({
    queryKey: ["compute-gpu-family", activeScopeKey, startSec, endSec, step],
    queryFn: async ({ signal }) => {
      const dcgm = await promQueryRangeGpuScopes(
        activeScopes,
        "DCGM_FI_DEV_GPU_UTIL",
        startSec,
        endSec,
        step,
        { signal }
      );
      const dcgmRows = matrixToChartRowsBySourceLabel(dcgm, "gpu");
      if (hasSeriesData(dcgmRows)) return "dcgm" as GpuFamily;
      const dcgmUuid = matrixToChartRowsBySourceLabel(dcgm, "UUID");
      if (hasSeriesData(dcgmUuid)) return "dcgm" as GpuFamily;

      const smi = await promQueryRangeGpuScopes(
        activeScopes,
        "nvidia_smi_utilization_gpu_ratio",
        startSec,
        endSec,
        step,
        { signal }
      );
      const smiRows = matrixToChartRowsBySourceLabel(smi, "uuid");
      if (hasSeriesData(smiRows)) return "nvidia_smi" as GpuFamily;
      const smiMinor = matrixToChartRowsBySourceLabel(smi, "minor_number");
      if (hasSeriesData(smiMinor)) return "nvidia_smi" as GpuFamily;

      return "none" as GpuFamily;
    },
    enabled: activeScopes.length > 0,
    staleTime: 60_000,
  });

  const family = familyQ.data ?? "none";

  const utilQ = useQuery({
    queryKey: ["compute-gpu-util", activeScopeKey, family, startSec, endSec, step],
    queryFn: ({ signal }) => {
      const q =
        family === "dcgm"
          ? "DCGM_FI_DEV_GPU_UTIL"
          : family === "nvidia_smi"
            ? "nvidia_smi_utilization_gpu_ratio * 100"
            : "vector(0)";
      return promQueryRangeGpuScopes(activeScopes, q, startSec, endSec, step, { signal });
    },
    enabled: family !== "none" && activeScopes.length > 0,
  });

  const tempQ = useQuery({
    queryKey: ["compute-gpu-temp", activeScopeKey, family, startSec, endSec, step],
    queryFn: ({ signal }) => {
      const q =
        family === "dcgm"
          ? "DCGM_FI_DEV_GPU_TEMP"
          : family === "nvidia_smi"
            ? "nvidia_smi_temperature_celsius"
            : "vector(0)";
      return promQueryRangeGpuScopes(activeScopes, q, startSec, endSec, step, { signal });
    },
    enabled: family !== "none" && activeScopes.length > 0,
  });

  const powerQ = useQuery({
    queryKey: ["compute-gpu-power", activeScopeKey, family, startSec, endSec, step],
    queryFn: ({ signal }) => {
      const q =
        family === "dcgm"
          ? "DCGM_FI_DEV_POWER_USAGE"
          : family === "nvidia_smi"
            ? "nvidia_smi_power_draw_watts"
            : "vector(0)";
      return promQueryRangeGpuScopes(activeScopes, q, startSec, endSec, step, { signal });
    },
    enabled: family !== "none" && activeScopes.length > 0,
  });

  const vramQ = useQuery({
    queryKey: ["compute-gpu-vram", activeScopeKey, family, startSec, endSec, step],
    queryFn: ({ signal }) =>
      family === "dcgm"
        ? promQueryRangeGpuScopes(activeScopes, "DCGM_FI_DEV_FB_USED", startSec, endSec, step, { signal })
        : Promise.resolve({ status: "success", data: { result: [] } }),
    enabled: family === "dcgm" && activeScopes.length > 0,
  });

  const utilRows = useMemo(() => {
    if (family === "dcgm") {
      const byGpu = matrixToChartRowsBySourceLabel(utilQ.data, "gpu");
      if (hasSeriesData(byGpu)) return byGpu;
      return matrixToChartRowsBySourceLabel(utilQ.data, "UUID");
    }
    if (family === "nvidia_smi") {
      const u = matrixToChartRowsBySourceLabel(utilQ.data, "uuid");
      if (hasSeriesData(u)) return u;
      return matrixToChartRowsBySourceLabel(utilQ.data, "minor_number");
    }
    return [];
  }, [family, utilQ.data]);

  const tempRows = useMemo(() => {
    if (family === "dcgm") {
      const byGpu = matrixToChartRowsBySourceLabel(tempQ.data, "gpu");
      if (hasSeriesData(byGpu)) return byGpu;
      return matrixToChartRowsBySourceLabel(tempQ.data, "UUID");
    }
    if (family === "nvidia_smi") {
      const u = matrixToChartRowsBySourceLabel(tempQ.data, "uuid");
      if (hasSeriesData(u)) return u;
      return matrixToChartRowsBySourceLabel(tempQ.data, "minor_number");
    }
    return [];
  }, [family, tempQ.data]);

  const powerRows = useMemo(() => {
    if (family === "dcgm") {
      const byGpu = matrixToChartRowsBySourceLabel(powerQ.data, "gpu");
      if (hasSeriesData(byGpu)) return byGpu;
      return matrixToChartRowsBySourceLabel(powerQ.data, "UUID");
    }
    if (family === "nvidia_smi") {
      const u = matrixToChartRowsBySourceLabel(powerQ.data, "uuid");
      if (hasSeriesData(u)) return u;
      return matrixToChartRowsBySourceLabel(powerQ.data, "minor_number");
    }
    return [];
  }, [family, powerQ.data]);

  const vramRows = useMemo(() => {
    if (family !== "dcgm") return [];
    const byGpu = matrixToChartRowsBySourceLabel(vramQ.data, "gpu");
    if (hasSeriesData(byGpu)) return byGpu;
    return matrixToChartRowsBySourceLabel(vramQ.data, "UUID");
  }, [family, vramQ.data]);

  const utilKeys = useMemo(() => seriesKeys(utilRows), [utilRows]);
  const tempKeys = useMemo(() => seriesKeys(tempRows), [tempRows]);
  const powerKeys = useMemo(() => seriesKeys(powerRows), [powerRows]);
  const vramKeys = useMemo(() => seriesKeys(vramRows), [vramRows]);

  const instantQ = useQuery({
    queryKey: ["compute-gpu-instant", activeScopeKey, family],
    queryFn: async ({ signal }) => {
      if (family === "dcgm") {
        const data = await promQueryGpuScopes(activeScopes, "DCGM_FI_DEV_GPU_UTIL", { signal });
        return promInstantVector(data);
      }
      if (family === "nvidia_smi") {
        const data = await promQueryGpuScopes(activeScopes, "nvidia_smi_utilization_gpu_ratio * 100", { signal });
        return promInstantVector(data);
      }
      return [];
    },
    enabled: family !== "none" && activeScopes.length > 0,
    refetchInterval: 45_000,
  });

  const cfg = cfgQ.data;
  const promOk =
    cfg?.prometheusVcenterConfigured === true ||
    cfg?.prometheusPveConfigured === true ||
    cfg?.prometheusConfigured === true;

  if (cfgQ.isLoading || !cfg) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载配置…
      </div>
    );
  }

  if (!promOk) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GPU 监控</h1>
          <p className="mt-1 text-sm text-gray-500">需配置虚拟化侧 Prometheus，可覆盖 vCenter、PVE 或二者共用的数据源。</p>
        </div>
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
          <p className="font-medium">未配置 Prometheus</p>
          <p className="mt-1 text-xs text-amber-900/90">
            在运行时配置中填写 <code className="rounded bg-white/70 px-1">prometheusUrlVcenter</code>、{" "}
            <code className="rounded bg-white/70 px-1">prometheusUrlPve</code>（或兜底 prometheusUrl），并在对应
            Prometheus 中抓取 GPU Exporter（推荐 nvidia-dcgm-exporter）。
          </p>
          <Link
            to="/cluster/compute/config"
            className="mt-2 inline-block text-sm font-semibold text-amber-950 underline underline-offset-2"
          >
            配置
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">GPU 监控</h1>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">
          展示 vCenter、PVE 或合并数据源中的显卡利用率、温度与功耗时序。指标来自 Prometheus；请在对应实例上抓取{" "}
          <span className="font-mono text-xs">DCGM_FI_*</span>（DCGM）或{" "}
          <span className="font-mono text-xs">nvidia_smi_*</span>（nvidia_smi_exporter）。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-1">
          <Label className="text-xs">数据源</Label>
          <Select value={source} onValueChange={(v) => setSource(v as GpuPrometheusScope)}>
            <SelectTrigger className="h-9 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部可用</SelectItem>
              <SelectItem value="vcenter" disabled={!availableScopes.includes("vcenter")}>
                vCenter
              </SelectItem>
              <SelectItem value="pve" disabled={!availableScopes.includes("pve")}>
                PVE
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">时间范围</Label>
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">最近 1 小时</SelectItem>
              <SelectItem value="6h">最近 6 小时</SelectItem>
              <SelectItem value="24h">最近 24 小时</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            void familyQ.refetch();
            void utilQ.refetch();
            void tempQ.refetch();
            void powerQ.refetch();
            void vramQ.refetch();
            void instantQ.refetch();
          }}
        >
          刷新
        </Button>
        <span className="text-xs text-slate-500">
          当前查询：{activeScopes.length ? activeScopes.map((s) => (s === "pve" ? "PVE" : "vCenter")).join(" + ") : "未配置"}
        </span>
        <Link to="/cluster/compute/dashboard" className="text-xs font-medium text-violet-700 hover:underline">
          返回算力总览
        </Link>
        <Link to="/cluster/compute/config" className="text-xs font-medium text-slate-600 hover:underline">
          配置
        </Link>
      </div>

      {familyQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在探测 GPU 指标…
        </div>
      ) : activeScopes.length === 0 ? (
        <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 px-5 py-4 text-sm text-amber-950">
          当前选择的数据源未配置。请选择“全部可用”，或在配置中填写对应的 Prometheus 地址。
        </div>
      ) : family === "none" ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-800">
          <p className="font-medium">未检测到 GPU 时序指标</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            当前 Prometheus 在最近时间窗内没有返回{" "}
            <code className="rounded bg-white px-1 font-mono">DCGM_FI_DEV_GPU_UTIL</code> 或{" "}
            <code className="rounded bg-white px-1 font-mono">nvidia_smi_utilization_gpu_ratio</code>
            。双卡环境请在 Exporter 中确认两张卡均有样本；PVE 与 vCenter 可分别写入{" "}
            <code className="rounded bg-white px-1">prometheusUrlPve</code> /{" "}
            <code className="rounded bg-white px-1">prometheusUrlVcenter</code>，也可以共用兜底 prometheusUrl。
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/50 px-3 py-2 text-xs text-emerald-950">
            已识别指标族：
            <strong className="ml-1">{family === "dcgm" ? "NVIDIA DCGM Exporter" : "nvidia_smi_exporter"}</strong>
            ；当前时间范围内共 <strong className="tabular-nums">{utilKeys.length}</strong> 条显卡序列。
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {instantQ.data?.map((row, idx) => {
              const raw =
                row.metric["gpu"] ??
                row.metric["UUID"] ??
                row.metric["uuid"] ??
                row.metric["minor_number"] ??
                String(idx);
              return (
                <div key={raw + idx} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p className="text-[11px] font-medium text-slate-600">{cnGpuLegend(String(raw))}</p>
                  <p className="mt-2 font-mono text-lg font-semibold tabular-nums text-slate-900">
                    {instantQ.isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                    ) : (
                      `${row.value.toFixed(1)} %`
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">当前 GPU 利用率</p>
                </div>
              );
            })}
          </div>

          <div className="grid gap-5 lg:grid-cols-1">
            <ChartCard title="GPU 利用率（%）" loading={utilQ.isLoading}>
              {utilRows.length === 0 && !utilQ.isLoading ? (
                <p className="text-xs text-slate-500">暂无数据</p>
              ) : (
                <ChartContainer config={chartUtil} className="h-[280px] w-full sm:h-[320px]">
                  <LineChart data={utilRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(v) => fmtAxisTime(String(v))}
                      tick={{ fontSize: 10 }}
                      stroke="hsl(215 16% 65%)"
                    />
                    <YAxis tick={{ fontSize: 10 }} width={48} domain={[0, 100]} stroke="hsl(215 16% 65%)" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => cnGpuLegend(String(v))} />
                    {utilKeys.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={palette[i % palette.length]}
                        dot={false}
                        strokeWidth={1.4}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </ChartCard>

            <ChartCard title="GPU 核心温度（°C）" loading={tempQ.isLoading}>
              {tempRows.length === 0 && !tempQ.isLoading ? (
                <p className="text-xs text-slate-500">暂无数据</p>
              ) : (
                <ChartContainer config={chartTemp} className="h-[260px] w-full sm:h-[300px]">
                  <LineChart data={tempRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(v) => fmtAxisTime(String(v))}
                      tick={{ fontSize: 10 }}
                      stroke="hsl(215 16% 65%)"
                    />
                    <YAxis tick={{ fontSize: 10 }} width={44} stroke="hsl(215 16% 65%)" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => cnGpuLegend(String(v))} />
                    {tempKeys.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={palette[i % palette.length]}
                        dot={false}
                        strokeWidth={1.4}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </ChartCard>

            <ChartCard title="GPU 功耗（W）" loading={powerQ.isLoading}>
              {powerRows.length === 0 && !powerQ.isLoading ? (
                <p className="text-xs text-slate-500">暂无数据（部分 Exporter 不提供功耗）</p>
              ) : (
                <ChartContainer config={chartPower} className="h-[260px] w-full sm:h-[300px]">
                  <LineChart data={powerRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                    <XAxis
                      dataKey="t"
                      tickFormatter={(v) => fmtAxisTime(String(v))}
                      tick={{ fontSize: 10 }}
                      stroke="hsl(215 16% 65%)"
                    />
                    <YAxis tick={{ fontSize: 10 }} width={44} stroke="hsl(215 16% 65%)" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => cnGpuLegend(String(v))} />
                    {powerKeys.map((k, i) => (
                      <Line
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={k}
                        stroke={palette[i % palette.length]}
                        dot={false}
                        strokeWidth={1.4}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ChartContainer>
              )}
            </ChartCard>

            {family === "dcgm" ? (
              <ChartCard title="GPU 显存占用（MiB，DCGM）" loading={vramQ.isLoading}>
                {vramRows.length === 0 && !vramQ.isLoading ? (
                  <p className="text-xs text-slate-500">暂无数据</p>
                ) : (
                  <ChartContainer config={chartVram} className="h-[260px] w-full sm:h-[300px]">
                    <LineChart data={vramRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 4" className="stroke-slate-200/80" />
                      <XAxis
                        dataKey="t"
                        tickFormatter={(v) => fmtAxisTime(String(v))}
                        tick={{ fontSize: 10 }}
                        stroke="hsl(215 16% 65%)" />
                      <YAxis tick={{ fontSize: 10 }} width={52} stroke="hsl(215 16% 65%)" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => cnGpuLegend(String(v))} />
                      {vramKeys.map((k, i) => (
                        <Line
                          key={k}
                          type="monotone"
                          dataKey={k}
                          name={k}
                          stroke={palette[i % palette.length]}
                          dot={false}
                          strokeWidth={1.4}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ChartContainer>
                )}
              </ChartCard>
            ) : null}
          </div>
        </>
      )}

      {familyQ.isError && (
        <p className="text-sm text-red-600">{familyQ.error instanceof Error ? familyQ.error.message : "加载失败"}</p>
      )}
    </div>
  );
};

function ChartCard({
  title,
  children,
  loading,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-sm"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
      </div>
      {children}
    </div>
  );
}

export default VCenterGpuDashboard;
