import { prometheusQueryApi, prometheusQueryRangeApi, type ApiFetchOptions } from "@/lib/api";

export type GpuPrometheusScope = "all" | "vcenter" | "pve";
export type ConcreteGpuPrometheusScope = Exclude<GpuPrometheusScope, "all">;

const gpuScopeLabel: Record<ConcreteGpuPrometheusScope, string> = {
  vcenter: "vCenter",
  pve: "PVE",
};

/** Prometheus /api/v1/query 响应（节选） */
export type PromInstantData = {
  status?: string;
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      value?: [number, string];
    }>;
  };
};

/** Prometheus /api/v1/query_range 响应（节选） */
export type PromRangeData = {
  status?: string;
  data?: {
    resultType?: string;
    result?: Array<{
      metric?: Record<string, string>;
      values?: [number, string][];
    }>;
  };
};

export function promInstantScalar(data: unknown): number | null {
  const d = data as PromInstantData;
  if (d?.status !== "success") return null;
  const v = d?.data?.result?.[0]?.value?.[1];
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** 从 instant vector 取多条（如 group by） */
export function promInstantVector(data: unknown): Array<{ metric: Record<string, string>; value: number }> {
  const d = data as PromInstantData;
  if (d?.status !== "success" || !d.data?.result) return [];
  return d.data.result
    .map((r) => {
      const v = r.value?.[1];
      const n = v != null ? parseFloat(String(v)) : NaN;
      return {
        metric: r.metric ?? {},
        value: Number.isFinite(n) ? n : NaN,
      };
    })
    .filter((x) => Number.isFinite(x.value));
}

export async function promQueryVcenter(q: string, opt?: ApiFetchOptions): Promise<unknown> {
  return prometheusQueryApi("vcenter", q, opt);
}

export async function promQueryNetwork(q: string, opt?: ApiFetchOptions): Promise<unknown> {
  return prometheusQueryApi("network", q, opt);
}

export async function promQueryRangeVcenter(
  q: string,
  startSec: number,
  endSec: number,
  step: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return prometheusQueryRangeApi("vcenter", q, startSec, endSec, step, opt);
}

export async function promQueryRangeGpuScopes(
  scopes: ConcreteGpuPrometheusScope[],
  q: string,
  startSec: number,
  endSec: number,
  step: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  const concreteScopes = Array.from(new Set(scopes));
  if (concreteScopes.length === 0) {
    return { status: "success", data: { result: [] } };
  }
  const settled = await Promise.allSettled(
    concreteScopes.map(async (scope) => ({
      scope,
      data: await prometheusQueryRangeApi(scope, q, startSec, endSec, step, opt),
    }))
  );
  return mergePrometheusScopedResults(settled);
}

export async function promQueryGpuScopes(
  scopes: ConcreteGpuPrometheusScope[],
  q: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  const concreteScopes = Array.from(new Set(scopes));
  if (concreteScopes.length === 0) {
    return { status: "success", data: { result: [] } };
  }
  const settled = await Promise.allSettled(
    concreteScopes.map(async (scope) => ({
      scope,
      data: await prometheusQueryApi(scope, q, opt),
    }))
  );
  return mergePrometheusScopedResults(settled);
}

function mergePrometheusScopedResults(
  settled: PromiseSettledResult<{ scope: ConcreteGpuPrometheusScope; data: unknown }>[]
): PromInstantData | PromRangeData {
  const results: Array<{
    metric?: Record<string, string>;
    value?: [number, string];
    values?: [number, string][];
  }> = [];
  let resultType = "";
  let successCount = 0;
  const errors: string[] = [];

  for (const item of settled) {
    if (item.status === "rejected") {
      errors.push(item.reason instanceof Error ? item.reason.message : String(item.reason));
      continue;
    }
    const d = item.value.data as PromInstantData | PromRangeData;
    if (d?.status !== "success" || !d.data?.result) {
      continue;
    }
    successCount += 1;
    resultType ||= d.data.resultType ?? "";
    const source = gpuScopeLabel[item.value.scope];
    for (const row of d.data.result) {
      const metric = { ...(row.metric ?? {}), kubebt_scope: item.value.scope, kubebt_source: source };
      results.push({ ...row, metric });
    }
  }

  if (successCount === 0 && errors.length > 0) {
    throw new Error(errors.join("；"));
  }
  return { status: "success", data: { resultType, result: results } };
}

export async function promQueryRangeNetwork(
  q: string,
  startSec: number,
  endSec: number,
  step: string,
  opt?: ApiFetchOptions
): Promise<unknown> {
  return prometheusQueryRangeApi("network", q, startSec, endSec, step, opt);
}

/** matrix 折线序列的图例标签（来自 Prometheus metric 标签键） */
export type PromMatrixLabelKey = "vm_name" | "ds_name" | "host_name" | "name";

/** 将 matrix 转为 Recharts 多序列折线数据 */
export function matrixToChartRows(
  data: unknown,
  labelKey: PromMatrixLabelKey
): Record<string, string | number>[] {
  const d = data as PromRangeData;
  if (d?.status !== "success" || !d.data?.result?.length) return [];
  const tsMap = new Map<number, Record<string, number | string>>();

  for (const r of d.data.result) {
    const m = r.metric ?? {};
    const label =
      m[labelKey] ??
      m["__name__"] ??
      Object.entries(m)
        .map(([a, b]) => `${a}=${b}`)
        .join(",");
    for (const pair of r.values ?? []) {
      const [tsStr, valStr] = pair;
      const ts = Math.floor(Number(tsStr));
      if (!Number.isFinite(ts)) continue;
      const v = parseFloat(String(valStr));
      if (!tsMap.has(ts)) {
        tsMap.set(ts, { t: new Date(ts * 1000).toISOString() });
      }
      const row = tsMap.get(ts)!;
      row[String(label)] = Number.isFinite(v) ? v : 0;
    }
  }

  return Array.from(tsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

/** 任意标签键（如 ip_addr、interface、name_cn）作为序列名，用于 ikuai_exporter 等 */
export function matrixToChartRowsByLabel(
  data: unknown,
  labelKey: string
): Record<string, string | number>[] {
  const d = data as PromRangeData;
  if (d?.status !== "success" || !d.data?.result?.length) return [];
  const tsMap = new Map<number, Record<string, number | string>>();

  for (const r of d.data.result) {
    const m = r.metric ?? {};
    const label =
      (m[labelKey] && String(m[labelKey])) ||
      m["__name__"] ||
      Object.entries(m)
        .filter(([k]) => !k.startsWith("__"))
        .map(([a, b]) => `${a}=${b}`)
        .join(",");
    for (const pair of r.values ?? []) {
      const [tsStr, valStr] = pair;
      const ts = Math.floor(Number(tsStr));
      if (!Number.isFinite(ts)) continue;
      const v = parseFloat(String(valStr));
      if (!tsMap.has(ts)) {
        tsMap.set(ts, { t: new Date(ts * 1000).toISOString() });
      }
      const row = tsMap.get(ts)!;
      row[String(label)] = Number.isFinite(v) ? v : 0;
    }
  }

  return Array.from(tsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

export function matrixToChartRowsBySourceLabel(
  data: unknown,
  labelKey: string
): Record<string, string | number>[] {
  const d = data as PromRangeData;
  if (d?.status !== "success" || !d.data?.result?.length) return [];
  const tsMap = new Map<number, Record<string, number | string>>();

  for (const r of d.data.result) {
    const m = r.metric ?? {};
    const rawLabel =
      (m[labelKey] && String(m[labelKey])) ||
      m["__name__"] ||
      Object.entries(m)
        .filter(([k]) => !k.startsWith("__") && !k.startsWith("kubebt_"))
        .map(([a, b]) => `${a}=${b}`)
        .join(",");
    const source = m.kubebt_source ? `${m.kubebt_source} / ` : "";
    const label = `${source}${rawLabel}`;
    for (const pair of r.values ?? []) {
      const [tsStr, valStr] = pair;
      const ts = Math.floor(Number(tsStr));
      if (!Number.isFinite(ts)) continue;
      const v = parseFloat(String(valStr));
      if (!tsMap.has(ts)) {
        tsMap.set(ts, { t: new Date(ts * 1000).toISOString() });
      }
      const row = tsMap.get(ts)!;
      row[String(label)] = Number.isFinite(v) ? v : 0;
    }
  }

  return Array.from(tsMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
