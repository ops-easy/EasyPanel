import type { SystemCheckItem } from "@/lib/api";

export function readinessStatus(item?: SystemCheckItem): string {
  return String(item?.status ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

export function readinessHasProblem(item?: SystemCheckItem): boolean {
  const status = readinessStatus(item);
  return status === "configured_unreachable" || status === "datasource_error";
}

export function readinessIsReady(item?: SystemCheckItem): boolean {
  return readinessStatus(item) === "readonly_reachable";
}

export function readinessIsConfigured(item?: SystemCheckItem): boolean {
  const status = readinessStatus(item);
  if (status === "not_configured" || status === "hidden" || status === "") return false;
  return (
    item?.configured === true ||
    status === "readonly_reachable" ||
    status === "configured_unreachable" ||
    status === "datasource_error"
  );
}

export function readinessMetric(item: SystemCheckItem | undefined, fallback: number | string): number | string {
  switch (readinessStatus(item)) {
    case "readonly_reachable":
      return "\u53ea\u8bfb\u53ef\u8fbe";
    case "configured_unreachable":
      return "\u4e0d\u53ef\u8fbe";
    case "datasource_error":
      return "\u6570\u636e\u6e90\u5f02\u5e38";
    case "not_configured":
      return "\u672a\u914d\u7f6e";
    case "hidden":
      return "\u53d7\u9650";
    default:
      return fallback;
  }
}

export function readinessHint(label: string, item?: SystemCheckItem): string {
  const status = readinessStatus(item);
  if (status === "readonly_reachable") return `${label} \u53ea\u8bfb\u63a2\u6d3b\u53ef\u8fbe\u3002`;
  if (status === "configured_unreachable") {
    return `${label} \u5df2\u914d\u7f6e\u4f46\u5f53\u524d\u4e0d\u53ef\u8fbe\uff1a${
      item?.msg ?? "\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u51ed\u636e\u6216\u8bc1\u4e66\u914d\u7f6e"
    }\u3002`;
  }
  if (status === "datasource_error") {
    return `${label} \u6570\u636e\u6e90\u5f02\u5e38\uff1a${
      item?.msg ?? "\u8bf7\u68c0\u67e5\u67e5\u8be2\u5165\u53e3\u4e0e\u8fd4\u56de\u683c\u5f0f"
    }\u3002`;
  }
  if (status === "not_configured") return `${label} \u672a\u914d\u7f6e\u3002`;
  if (status === "hidden") return `${label} \u5f53\u524d\u8d26\u53f7\u65e0\u6743\u67e5\u770b\u5b8c\u6574\u63a2\u6d4b\u7ed3\u679c\u3002`;
  return "";
}

export function readinessAccessStatus(item?: SystemCheckItem, loading = false): "ok" | "warn" | "missing" | "unknown" {
  if (loading) return "unknown";
  const status = readinessStatus(item);
  if (status === "readonly_reachable") return "ok";
  if (status === "configured_unreachable" || status === "datasource_error") return "warn";
  if (status === "not_configured") return "missing";
  return "unknown";
}

export type ReadinessLoginTone = "ok" | "warn" | "pending" | "hidden";

export type ReadinessLoginSummary = {
  state: string;
  detail: string;
  tone: ReadinessLoginTone;
};

export function readinessLoginSummary(
  item: SystemCheckItem | undefined,
  pendingDetail: string,
  hiddenDetail = "登录后查看详情"
): ReadinessLoginSummary {
  const detail = item?.msg || pendingDetail;

  switch (readinessStatus(item)) {
    case "readonly_reachable":
      return { state: "只读可达", detail, tone: "ok" };
    case "configured_unreachable":
      return { state: "不可达", detail, tone: "warn" };
    case "datasource_error":
      return { state: "数据源异常", detail, tone: "warn" };
    case "hidden":
      return { state: "受限", detail: hiddenDetail, tone: "hidden" };
    default:
      return { state: "未配置", detail: pendingDetail, tone: "pending" };
  }
}
