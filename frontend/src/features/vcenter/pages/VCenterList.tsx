import React, { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui/table";
import { apiGetJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  VCenterVMRow,
  VCenterVMsResponse,
} from "./types";
import { VCenterPercentBar } from "./VCenterPercentBar";

function vmDetailPath(moref: string): string {
  return `/cluster/compute/vcenter/vms/${encodeURIComponent(moref)}`;
}

function vmCpuPct(vm: VCenterVMRow): number | null {
  const on = vm.powerState === "poweredOn" || vm.powerState === "suspended";
  if (!on) return null;
  if ((vm.cpuCapacityMHz ?? 0) <= 0) return null;
  return vm.cpuUsagePercent ?? 0;
}

function vmMemPct(vm: VCenterVMRow): number | null {
  const on = vm.powerState === "poweredOn" || vm.powerState === "suspended";
  if (!on) return null;
  if ((vm.memoryMaxMB ?? 0) > 0) return vm.memoryUsagePercent ?? 0;
  if ((vm.memoryMB ?? 0) > 0) return vm.memoryUsagePercent ?? 0;
  return null;
}

/** 存储已提交占（已提交+未提交）比例；无数据或分母为 0 时返回 null */
function vmDiskPct(vm: VCenterVMRow): number | null {
  const p = vm.diskUsagePercent;
  if (p == null || !Number.isFinite(p)) return null;
  return p;
}

function powerStateBadge(powerState: string | undefined) {
  const s = (powerState ?? "").toLowerCase();
  if (s === "poweredon") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-200 bg-emerald-50 font-normal text-emerald-800"
      >
        运行中
      </Badge>
    );
  }
  if (s === "poweredoff") {
    return (
      <Badge variant="outline" className="border-slate-200 bg-slate-100 font-normal text-slate-700">
        已关机
      </Badge>
    );
  }
  if (s === "suspended") {
    return (
      <Badge
        variant="outline"
        className="border-amber-200 bg-amber-50 font-normal text-amber-900"
      >
        已挂起
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal">
      {powerState || "—"}
    </Badge>
  );
}

function memAllocMB(vm: VCenterVMRow): number {
  return (vm.memoryMaxMB ?? 0) > 0 ? vm.memoryMaxMB! : vm.memoryMB;
}

function formatSpec(vm: VCenterVMRow): string {
  const gib = vm.memoryMB > 0 ? (vm.memoryMB / 1024).toFixed(vm.memoryMB % 1024 === 0 ? 0 : 1) : "—";
  return `${vm.cpu} vCPU · ${gib} GiB`;
}

const VCenterList: React.FC = () => {
  const [filter, setFilter] = useState("");
  const queryClient = useQueryClient();

  const statusQ = useQuery({
    queryKey: ["vcenter-status"],
    queryFn: ({ signal }) =>
      apiGetJson<{ configured: boolean; vcenterUrlHint?: string }>(
        "/api/vcenter/status"
      , { signal }),
  });

  const appCfgQ = useAppConfig();
  const vcStaleMs = Math.max(
    30_000,
    (appCfgQ.data?.vcenterCacheTtlSec ?? 120) * 1000
  );

  const vmsQ = useQuery({
    queryKey: ["vcenter-vms"],
    queryFn: ({ signal }) => apiGetJson<VCenterVMsResponse>("/api/vcenter/vms", { signal }),
    enabled: statusQ.data?.configured === true,
    staleTime: vcStaleMs,
    refetchOnWindowFocus: false,
  });

  const vmsConfigured = statusQ.data?.configured === true;
  useEffect(() => {
    if (!vmsConfigured) return;
    const id = window.setInterval(() => {
      void queryClient.fetchQuery({
        queryKey: ["vcenter-vms"],
        queryFn: ({ signal }) =>
          apiGetJson<VCenterVMsResponse>("/api/vcenter/vms?refresh=1", { signal }),
      });
    }, 22_000);
    return () => clearInterval(id);
  }, [vmsConfigured, queryClient]);

  const allVms = useMemo(() => vmsQ.data?.vms ?? [], [vmsQ.data?.vms]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allVms;
    return allVms.filter((vm) => {
      const name = (vm.name ?? "").toLowerCase();
      const id = (vm.moref ?? "").toLowerCase();
      const ip = (vm.ip ?? "").toLowerCase();
      const guest = (vm.guestId ?? "").toLowerCase();
      return (
        name.includes(q) ||
        id.includes(q) ||
        ip.includes(q) ||
        guest.includes(q)
      );
    });
  }, [allVms, filter]);

  const poweredOn = useMemo(
    () =>
      allVms.filter((v) => (v.powerState ?? "").toLowerCase() === "poweredon")
        .length,
    [allVms]
  );

  if (statusQ.isLoading) {
    return <p className="text-gray-500">加载中…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-900">
            云主机（虚拟机）
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            列表展示 vCenter 中的虚拟机；<strong className="font-medium text-slate-700">电源状态约每 22 秒</strong>向 vCenter 拉取刷新（
            <span className="font-mono text-xs">?refresh=1</span>
            ），便于捕获重启、关机、挂起等变化。
            <strong className="font-medium text-slate-700"> 存储承诺</strong>为 vCenter 摘要中的薄置备已提交占（已提交 + 未提交）百分比，与来宾机{" "}
            <span className="font-mono text-xs">df</span> 不同。
            名称可能含表情或长文本，请使用右侧「实例 ID」或「详情」进入，不依赖名称链接。
          </p>
        </div>
        {allVms.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
            <span className="text-slate-500">共计</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {allVms.length}
            </span>
            <span className="text-slate-500">台</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">运行中</span>
            <span className="font-semibold tabular-nums text-emerald-700">
              {poweredOn}
            </span>
          </div>
        )}
      </div>

      {statusQ.data?.vcenterUrlHint && (
        <p className="text-sm text-slate-500">
          vCenter：{statusQ.data.vcenterUrlHint}
        </p>
      )}

      {vmsQ.isLoading && <p className="text-slate-500">加载虚拟机列表…</p>}
      {vmsQ.error && (
        <p className="text-red-600">{(vmsQ.error as Error).message}</p>
      )}

      {vmsQ.data && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="搜索名称、实例 ID、IP、GuestId…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="h-10 border-slate-200 bg-white pl-9"
                aria-label="筛选虚拟机"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="shrink-0 text-xs text-slate-500">
                显示{" "}
                <span className="font-medium tabular-nums text-slate-800">
                  {filtered.length}
                </span>{" "}
                / {allVms.length} 台
              </p>
            </div>
          </div>
          {allVms.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center text-sm text-slate-500">
              未发现虚拟机（或当前账号无权限）。
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-amber-50/40 px-6 py-10 text-center text-sm text-amber-950">
              无匹配结果，请调整搜索关键词。
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                      <TableHead className="sticky top-0 z-10 min-w-[140px] max-w-[240px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        名称
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        实例 ID
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        电源
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        状态
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        CPU
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        内存
                      </TableHead>
                      <TableHead
                        className="sticky top-0 z-10 min-w-[120px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm"
                        title="薄置备存储承诺比（vSphere 已提交/已提交+未承诺）；厚置备或无未承诺时为 —，与来宾 df 不同"
                      >
                        存储承诺
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 whitespace-nowrap bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        规格
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[100px] max-w-[140px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        私网 IP
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 min-w-[100px] max-w-[160px] bg-slate-50/95 font-semibold text-slate-800 backdrop-blur-sm">
                        系统
                      </TableHead>
                      <TableHead className="sticky top-0 z-10 w-[100px] bg-slate-50/95 text-right font-semibold text-slate-800 backdrop-blur-sm">
                        操作
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((vm, i) => (
                      <TableRow
                        key={vm.moref}
                        className={cn(
                          "border-slate-100",
                          i % 2 === 1 ? "bg-slate-50/40" : "bg-white"
                        )}
                      >
                        <TableCell className="max-w-[240px] align-top">
                          <p
                            className="line-clamp-2 break-words text-sm font-medium leading-snug text-slate-900"
                            title={vm.name}
                          >
                            {vm.name || "（未命名）"}
                          </p>
                        </TableCell>
                        <TableCell className="align-top font-mono text-[11px] text-slate-600">
                          {vm.moref}
                        </TableCell>
                        <TableCell className="align-top">
                          {powerStateBadge(vm.powerState)}
                        </TableCell>
                        <TableCell className="align-top text-xs text-slate-600">
                          {vm.overallStatus ?? "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmCpuPct(vm)} />
                            <p className="whitespace-nowrap text-[11px] text-slate-500">
                              {vm.cpuUsageMHz ?? 0} / {vm.cpuCapacityMHz ?? 0}{" "}
                              MHz
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmMemPct(vm)} />
                            <p className="whitespace-nowrap text-[11px] text-slate-500">
                              {vm.memoryUsageMB ?? 0} / {memAllocMB(vm)} MB
                            </p>
                          </div>
                        </TableCell>
                        <TableCell
                          className="align-top"
                          title="薄置备：已提交÷(已提交+未承诺)×100%，随实际占用升高；厚置备或未报告未承诺时无此项（非 df 磁盘占用）"
                        >
                          <div className="min-w-[110px] space-y-1">
                            <VCenterPercentBar value={vmDiskPct(vm)} />
                            {vmDiskPct(vm) != null ? (
                              <p className="whitespace-nowrap text-[11px] text-slate-500">
                                {vm.diskUsagePercent!.toFixed(1)}%
                              </p>
                            ) : (
                              <p className="text-[11px] text-slate-400">—</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap align-top text-xs text-slate-700">
                          {formatSpec(vm)}
                        </TableCell>
                        <TableCell className="max-w-[140px] align-top font-mono text-xs text-slate-700">
                          <span className="block truncate" title={vm.ip || ""}>
                            {vm.ip || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[160px] align-top text-xs text-slate-600">
                          <span className="line-clamp-2 break-all" title={vm.guestId}>
                            {vm.guestId || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="align-top text-right">
                          <Button variant="ghost" size="sm" className="h-8 gap-0.5 px-2" asChild>
                            <Link to={vmDetailPath(vm.moref)}>
                              详情
                              <ChevronRight className="h-3.5 w-3.5 opacity-60" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VCenterList;
