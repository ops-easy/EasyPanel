import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export function normalizedBaseUrl(baseUrl) {
  if (!baseUrl) return "";
  return baseUrl.href.replace(/\/$/, "");
}

export function createSmokeSummary(script, baseUrl) {
  return {
    schemaVersion: 1,
    script,
    status: "running",
    baseUrl: normalizedBaseUrl(baseUrl),
    baseOrigin: baseUrl?.origin ?? "",
    smokeRoutes: [],
    readonlyChecks: [],
    failedItems: [],
    exitCode: null,
  };
}

export function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function recordSmokeRoute(summary, { kind = "smokeRoute", path: routePath, statusCode = null, ok = true, message = "" }) {
  const item = {
    kind,
    path: routePath,
    statusCode,
    ok,
  };
  if (message) item.message = message;
  summary.smokeRoutes.push(item);

  if (!ok) {
    recordFailedItem(summary, { kind, path: routePath, statusCode, message });
  }
}

export function recordReadonlyCheck(
  summary,
  {
    endpoint,
    key,
    statusCode = null,
    status = "",
    configured = null,
    reachable = null,
    readonly = null,
    ok = true,
    message = "",
  },
) {
  const item = {
    endpoint,
    key,
    statusCode,
    status,
    configured,
    reachable,
    readonly,
    ok,
  };
  if (message) item.message = message;
  summary.readonlyChecks.push(item);

  if (!ok) {
    recordFailedItem(summary, { kind: "readonlyCheck", endpoint, key, statusCode, message });
  }
}

export function recordFailedItem(summary, item) {
  summary.failedItems.push(
    Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== "")),
  );
}

export function completeSmokeSummary(summary, status) {
  summary.status = status;
  summary.exitCode = status === "passed" ? 0 : 1;
  return summary;
}

export function resolveSummaryFile(fileName, explicitFile = "") {
  if (explicitFile) return explicitFile;
  if (process.env.SMOKE_SUMMARY_FILE) return process.env.SMOKE_SUMMARY_FILE;
  if (process.env.SMOKE_SUMMARY_DIR) return path.join(process.env.SMOKE_SUMMARY_DIR, fileName);
  return "";
}

export function emitSmokeSummary(summary, { fileName, explicitFile = "" }) {
  const payload = JSON.stringify(summary);
  console.log(`SMOKE_SUMMARY_JSON ${payload}`);

  const summaryFile = resolveSummaryFile(fileName, explicitFile);
  if (!summaryFile) return;

  mkdirSync(path.dirname(summaryFile), { recursive: true });
  writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
