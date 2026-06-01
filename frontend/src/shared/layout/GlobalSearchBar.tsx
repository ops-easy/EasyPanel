import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiGetJson } from "@/lib/api";
import type { PodRow } from "@/features/cluster/pages/types";
import type { VCenterVMsResponse } from "@/features/vcenter/pages/types";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/lib/utils";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function matches(q: string, ...fields: (string | number | null | undefined)[]) {
  const n = q.trim().toLowerCase();
  if (!n) return false;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(n));
}

type AppCenterSearchKind = "redis" | "mysql" | "kafka" | "openclaw" | "hermes";
type SearchKind = "vm" | "pod" | AppCenterSearchKind;

type SearchHit = {
  kind: SearchKind;
  moduleLabel: string;
  title: string;
  subtitle: string;
  href: string;
};

type RedisSearchRow = {
  id: number;
  name: string;
  mode?: string;
  summary?: {
    mode?: string;
    addr?: string;
    sentinelAddrs?: string[];
    masterName?: string;
    masterAddr?: string;
    replicaAddr?: string;
    clusterAddrs?: string[];
    k8sNamespace?: string;
    k8sBaseName?: string;
    k8sSvcPort?: number;
  };
};

type MySQLSearchRow = {
  id: number;
  name: string;
  mode?: string;
  summary?: {
    mode?: string;
    host?: string;
    port?: number;
    username?: string;
    defaultSchema?: string;
    k8sManaged?: boolean;
    k8sNamespace?: string;
    k8sBaseName?: string;
    k8sSvcPort?: number;
    k8sVersionLine?: string;
  };
};

type KafkaSearchRow = {
  id: number;
  name: string;
  config?: Record<string, unknown>;
};

type OpenClawSearchRow = {
  id: string;
  displayName?: string;
  namespace?: string;
  deploymentName?: string;
  serviceName?: string;
  image?: string;
  modelPreset?: string;
  chatModel?: string;
  exposeMode?: string;
  ingressHost?: string;
  publicV1Url?: string;
  externalV1Url?: string;
};

type HermesSearchRow = {
  id: string;
  displayName?: string;
  namespace?: string;
  deploymentName?: string;
  serviceName?: string;
  image?: string;
  mode?: string;
  modelProvider?: string;
  modelName?: string;
  exposeMode?: string;
  ingressHost?: string;
  publicUrl?: string;
};

type GlobalSearchBarProps = {
  tone?: "light" | "dark";
};

function cfgStr(config: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = config?.[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return undefined;
}

function compactLine(...parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" / ");
}

function redisEndpointHint(s: RedisSearchRow["summary"]): string {
  if (!s) return "";
  if (s.addr) return s.addr;
  if (s.masterAddr) return s.masterAddr;
  if (s.clusterAddrs?.length) return s.clusterAddrs.join(" / ");
  if (s.sentinelAddrs?.length) return s.sentinelAddrs.join(" / ");
  if (s.k8sNamespace || s.k8sBaseName) {
    return compactLine(s.k8sNamespace, `${s.k8sBaseName ?? "redis"}:${s.k8sSvcPort ?? 6379}`);
  }
  return "";
}

function mysqlEndpointHint(s: MySQLSearchRow["summary"]): string {
  if (!s) return "";
  if (s.k8sManaged || s.k8sNamespace || s.k8sBaseName) {
    return compactLine(s.k8sNamespace, `${s.k8sBaseName ?? "mysql"}:${s.k8sSvcPort ?? 3306}`);
  }
  return `${s.host ?? "-"}:${s.port ?? 3306}`;
}

function badgeTone(kind: SearchKind, isDark: boolean): string {
  if (isDark) {
    switch (kind) {
      case "vm":
        return "border-violet-700/60 bg-violet-950/50 text-violet-200";
      case "pod":
        return "border-blue-700/60 bg-blue-950/50 text-blue-200";
      case "redis":
        return "border-emerald-700/60 bg-emerald-950/50 text-emerald-200";
      case "mysql":
        return "border-sky-700/60 bg-sky-950/50 text-sky-200";
      case "kafka":
        return "border-amber-700/60 bg-amber-950/50 text-amber-200";
      case "openclaw":
        return "border-violet-700/60 bg-violet-950/50 text-violet-200";
      case "hermes":
        return "border-pink-700/60 bg-pink-950/50 text-pink-200";
    }
  }
  switch (kind) {
    case "vm":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "pod":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "redis":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "mysql":
      return "border-sky-200 bg-sky-50 text-sky-900";
    case "kafka":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "openclaw":
      return "border-violet-200 bg-violet-50 text-violet-900";
    case "hermes":
      return "border-pink-200 bg-pink-50 text-pink-900";
  }
  return "border-slate-200 bg-slate-50 text-slate-900";
}

const GlobalSearchBar: React.FC<GlobalSearchBarProps> = ({ tone = "light" }) => {
  const navigate = useNavigate();
  const isDark = tone === "dark";
  const [raw, setRaw] = useState("");
  const debounced = useDebounced(raw, 280);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cfgQ = useAppConfig();
  const cfg = cfgQ.data;

  const q = debounced.trim();
  const enabled = q.length >= 1;
  const appCenterEnabled = Boolean(enabled && cfg && cfg.mysqlReachable !== false);

  const vmsQ = useQuery({
    queryKey: ["vcenter-vms"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: Boolean(cfg?.vcenterConfigured && enabled),
    staleTime: 60_000,
  });

  const podsQ = useQuery({
    queryKey: ["global-search-pods"],
    queryFn: ({ signal }) => apiGetJson<PodRow[]>("/api/k8s/pods", { signal }),
    enabled: Boolean(cfg?.k8sConfigured && enabled),
    staleTime: 60_000,
  });

  const redisQ = useQuery({
    queryKey: ["global-search-app-center-redis"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: RedisSearchRow[]; mysqlRequired?: boolean }>("/api/app-center/redis/instances", {
        signal,
      }),
    enabled: appCenterEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const mysqlQ = useQuery({
    queryKey: ["global-search-app-center-mysql"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: MySQLSearchRow[]; mysqlRequired?: boolean }>("/api/app-center/mysql/instances", {
        signal,
      }),
    enabled: appCenterEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const kafkaQ = useQuery({
    queryKey: ["global-search-app-center-kafka"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: KafkaSearchRow[]; mysqlRequired?: boolean }>("/api/app-center/kafka/instances", {
        signal,
      }),
    enabled: appCenterEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const openClawQ = useQuery({
    queryKey: ["global-search-app-center-openclaw"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: OpenClawSearchRow[]; mysqlRequired?: boolean }>("/api/app-center/openclaw/instances", {
        signal,
      }),
    enabled: appCenterEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const hermesQ = useQuery({
    queryKey: ["global-search-app-center-hermes"],
    queryFn: ({ signal }) =>
      apiGetJson<{ instances: HermesSearchRow[]; mysqlRequired?: boolean }>("/api/app-center/hermes/instances", {
        signal,
      }),
    enabled: appCenterEnabled,
    staleTime: 60_000,
    retry: false,
  });

  const results = useMemo((): SearchHit[] => {
    if (!enabled) return [];
    const out: SearchHit[] = [];

    if (vmsQ.data?.vms) {
      for (const vm of vmsQ.data.vms) {
        if (matches(q, vm.name, vm.moref, vm.ip)) {
          out.push({
            kind: "vm",
            moduleLabel: "虚拟机",
            title: vm.name,
            subtitle: vm.moref,
            href: `/cluster/compute/vcenter/vms/${encodeURIComponent(vm.moref)}`,
          });
        }
      }
    }

    if (podsQ.data) {
      for (const p of podsQ.data) {
        if (matches(q, p.name, p.namespace)) {
          out.push({
            kind: "pod",
            moduleLabel: "Pod",
            title: p.name,
            subtitle: `${p.namespace} / ${p.name}`,
            href: `/cluster/ns/${encodeURIComponent(p.namespace)}/pods/${encodeURIComponent(p.name)}`,
          });
        }
      }
    }

    for (const i of redisQ.data?.instances ?? []) {
      const endpoint = redisEndpointHint(i.summary);
      const title = i.name || `Redis #${i.id}`;
      if (
        matches(
          q,
          title,
          i.id,
          i.mode,
          i.summary?.mode,
          endpoint,
          i.summary?.masterName,
          i.summary?.k8sNamespace,
          i.summary?.k8sBaseName
        )
      ) {
        out.push({
          kind: "redis",
          moduleLabel: "Redis",
          title,
          subtitle: compactLine("应用中心", "Redis", endpoint || i.summary?.mode || i.mode),
          href: `/cluster/apps/redis?instance=${encodeURIComponent(String(i.id))}`,
        });
      }
    }

    for (const i of mysqlQ.data?.instances ?? []) {
      const endpoint = mysqlEndpointHint(i.summary);
      const title = i.name || `MySQL #${i.id}`;
      if (
        matches(
          q,
          title,
          i.id,
          i.mode,
          i.summary?.mode,
          endpoint,
          i.summary?.username,
          i.summary?.defaultSchema,
          i.summary?.k8sNamespace,
          i.summary?.k8sBaseName,
          i.summary?.k8sVersionLine
        )
      ) {
        out.push({
          kind: "mysql",
          moduleLabel: "MySQL",
          title,
          subtitle: compactLine("应用中心", "MySQL", endpoint || i.summary?.mode || i.mode),
          href: `/cluster/apps/mysql?instance=${encodeURIComponent(String(i.id))}`,
        });
      }
    }

    for (const i of kafkaQ.data?.instances ?? []) {
      const namespace = cfgStr(i.config, "namespace");
      const baseName = cfgStr(i.config, "baseName");
      const sasl = cfgStr(i.config, "saslMechanism");
      if (matches(q, i.name, i.id, namespace, baseName, sasl)) {
        out.push({
          kind: "kafka",
          moduleLabel: "Kafka",
          title: i.name || `Kafka #${i.id}`,
          subtitle: compactLine("应用中心", "Kafka", compactLine(namespace, baseName), sasl),
          href: `/cluster/apps/kafka/instance/${encodeURIComponent(String(i.id))}`,
        });
      }
    }

    for (const i of openClawQ.data?.instances ?? []) {
      const title = i.displayName || i.deploymentName || i.id;
      const access = i.publicV1Url || i.externalV1Url || i.ingressHost;
      if (
        matches(
          q,
          title,
          i.id,
          i.namespace,
          i.deploymentName,
          i.serviceName,
          i.image,
          i.modelPreset,
          i.chatModel,
          i.exposeMode,
          access
        )
      ) {
        out.push({
          kind: "openclaw",
          moduleLabel: "OpenClaw",
          title,
          subtitle: compactLine("应用中心", "OpenClaw", compactLine(i.namespace, i.deploymentName), access),
          href: `/cluster/apps/openclaw/${encodeURIComponent(i.id)}`,
        });
      }
    }

    for (const i of hermesQ.data?.instances ?? []) {
      const title = i.displayName || i.deploymentName || i.id;
      const access = i.publicUrl || i.ingressHost;
      if (
        matches(
          q,
          title,
          i.id,
          i.namespace,
          i.deploymentName,
          i.serviceName,
          i.image,
          i.mode,
          i.modelProvider,
          i.modelName,
          i.exposeMode,
          access
        )
      ) {
        out.push({
          kind: "hermes",
          moduleLabel: "Hermes",
          title,
          subtitle: compactLine("应用中心", "Hermes", compactLine(i.namespace, i.deploymentName), access),
          href: `/cluster/apps/hermes/${encodeURIComponent(i.id)}`,
        });
      }
    }

    return out.slice(0, 50);
  }, [enabled, q, vmsQ.data, podsQ.data, redisQ.data, mysqlQ.data, kafkaQ.data, openClawQ.data, hermesQ.data]);

  const loading =
    Boolean(cfg?.vcenterConfigured && enabled && vmsQ.isFetching) ||
    Boolean(cfg?.k8sConfigured && enabled && podsQ.isFetching) ||
    Boolean(
      appCenterEnabled &&
        (redisQ.isFetching || mysqlQ.isFetching || kafkaQ.isFetching || openClawQ.isFetching || hermesQ.isFetching)
    );

  const showPanel = open && enabled;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setRaw("");
    navigate(href);
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 max-w-md flex-1">
      <Search
        className={cn(
          "pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2",
          isDark ? "text-slate-500" : "text-gray-400"
        )}
        size={18}
        aria-hidden
      />
      <input
        type="search"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="搜索虚拟机、Pod、应用实例…"
        className={cn(
          "w-full rounded-xl py-2.5 pl-10 pr-4 text-sm outline-none transition-all",
          isDark
            ? "border border-slate-800 bg-[#111820] text-slate-100 placeholder:text-slate-500 focus:border-emerald-700 focus:bg-[#111820] focus:ring-2 focus:ring-emerald-900/40"
            : "border-transparent bg-[#F1F5F9] text-gray-800 placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-200"
        )}
        aria-label="全局搜索"
        autoComplete="off"
      />

      {showPanel && (
        <div
          className={cn(
            "absolute left-0 right-0 top-[calc(100%+6px)] z-[100] max-h-[min(60vh,420px)] overflow-y-auto rounded-xl border shadow-lg",
            isDark ? "border-slate-800 bg-[#111820] shadow-black/30" : "border-slate-200 bg-white"
          )}
          role="listbox"
          aria-label="搜索结果"
        >
          {loading && (
            <div className={cn("px-4 py-3 text-sm", isDark ? "text-slate-400" : "text-muted-foreground")}>搜索中…</div>
          )}
          {!loading && results.length === 0 && (
            <div className={cn("px-4 py-3 text-sm", isDark ? "text-slate-400" : "text-muted-foreground")}>无匹配结果</div>
          )}
          {!loading &&
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.href}-${i}`}
                type="button"
                role="option"
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 focus:outline-none",
                  isDark ? "border-slate-800 hover:bg-slate-800/70 focus:bg-slate-800/70" : "border-slate-100 hover:bg-slate-50 focus:bg-slate-50"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r.href)}
              >
                <Badge
                  variant="outline"
                  className={cn("mt-0.5 shrink-0 font-normal", badgeTone(r.kind, isDark))}
                >
                  {r.moduleLabel}
                </Badge>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate font-medium", isDark ? "text-slate-100" : "text-slate-900")}>
                    {r.title}
                  </span>
                  <span className={cn("mt-0.5 block truncate text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                    {r.subtitle}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchBar;
