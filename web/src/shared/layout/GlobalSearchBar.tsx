import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiGetJson, type AppConfig } from "@/lib/api";
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

function matches(q: string, ...fields: (string | undefined)[]) {
  const n = q.trim().toLowerCase();
  if (!n) return false;
  return fields.some((f) => (f ?? "").toLowerCase().includes(n));
}

type SearchHit = {
  kind: "vm" | "pod";
  title: string;
  subtitle: string;
  href: string;
};

type GlobalSearchBarProps = {
  tone?: "light" | "dark";
};

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

  const results = useMemo((): SearchHit[] => {
    if (!enabled) return [];
    const out: SearchHit[] = [];

    if (vmsQ.data?.vms) {
      for (const vm of vmsQ.data.vms) {
        if (matches(q, vm.name, vm.moref, vm.ip)) {
          out.push({
            kind: "vm",
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
            title: p.name,
            subtitle: `${p.namespace} / ${p.name}`,
            href: `/cluster/ns/${encodeURIComponent(p.namespace)}/pods/${encodeURIComponent(p.name)}`,
          });
        }
      }
    }

    return out.slice(0, 50);
  }, [enabled, q, vmsQ.data, podsQ.data]);

  const loading =
    Boolean(cfg?.vcenterConfigured && enabled && vmsQ.isFetching) ||
    Boolean(cfg?.k8sConfigured && enabled && podsQ.isFetching);

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
        placeholder="搜索虚拟机、Pod…"
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
                  "flex w-full items-start gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 focus:outline-none",
                  isDark ? "border-slate-800 hover:bg-slate-800/70 focus:bg-slate-800/70" : "border-slate-100 hover:bg-slate-50 focus:bg-slate-50"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(r.href)}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "mt-0.5 shrink-0 font-normal",
                    isDark
                      ? r.kind === "vm"
                        ? "border-violet-700/60 bg-violet-950/50 text-violet-200"
                        : "border-blue-700/60 bg-blue-950/50 text-blue-200"
                      : r.kind === "vm"
                        ? "border-violet-200 bg-violet-50 text-violet-900"
                        : "border-blue-200 bg-blue-50 text-blue-900"
                  )}
                >
                  {r.kind === "vm" ? "虚拟机" : "Pod"}
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
