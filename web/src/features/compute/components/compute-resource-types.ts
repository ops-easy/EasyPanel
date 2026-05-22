import type React from "react";

export type ComputeView = "guests" | "hosts" | "storage" | "activity";
export type ComputeProviderKey = "all" | "vcenter" | "pve" | string;
export type ComputeHealth = "all" | "ok" | "idle" | "warning" | "critical" | "unknown" | string;

export type ComputeProvider = {
  provider: ComputeProviderKey;
  targetId?: string;
  name?: string;
  configured?: boolean;
  healthy?: boolean;
  hint?: string;
  baseUrl?: string;
};

export type ComputeUsage = {
  cpuPct?: number;
  memoryPct?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskPct?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
};

export type ComputeRow = {
  provider: ComputeProviderKey;
  targetId?: string;
  resourceId?: string | number;
  name?: string;
  kind?: string;
  status?: string;
  statusLabel?: string;
  health?: ComputeHealth;
  running?: boolean;
  node?: string;
  ip?: string;
  guestType?: string;
  createdAt?: string;
  capabilities?: string[];
  actions?: string[];
  usage?: ComputeUsage;
  source?: Record<string, unknown>;
};

export type ComputeViewMeta = {
  title: string;
  endpoint: string;
  dataKey: ComputeView;
  empty: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
};

export type ComputeResourceFiltersState = {
  query: string;
  provider: string;
  health: string;
  status: string;
  node: string;
};

export const computeProviderLabels: Record<string, string> = {
  all: "全部来源",
  vcenter: "vCenter",
  pve: "PVE",
};

export const computeHealthLabels: Record<string, string> = {
  all: "全部状态",
  ok: "正常",
  idle: "空闲/停止",
  warning: "告警",
  critical: "异常",
  unknown: "未知",
};

