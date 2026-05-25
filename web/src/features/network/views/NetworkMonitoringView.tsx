import { Gauge } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { EmptyTableRow, formatDateTime, LoadingTableRow, NetworkStatusBadge } from "@/features/network/components/NetworkOpsPrimitives";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkDevice, NetworkMonitoringCoverage, NetworkMonitoringFamily, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard, ViewToolbar } from "./NetworkViewPrimitives";

export function NetworkMonitoringView({
  rows,
  coverage,
  loading,
  emptyLabel,
  devices,
  provider,
  canWrite,
  canViewRaw,
}: {
  rows: NetworkMonitoringFamily[];
  coverage: NetworkMonitoringCoverage[];
  loading: boolean;
  emptyLabel: string;
  devices: NetworkDevice[];
  provider: ProviderKey;
  canWrite: boolean;
  canViewRaw: boolean;
}) {
  const monitoringHints = Array.from(new Set(coverage.flatMap((item) => item.missingHints ?? []).filter(Boolean)));
  return (
    <div className="grid min-w-0 gap-3">
      <ViewToolbar
        title="监控采集覆盖"
        description="统一检查 iKuai Exporter 与 OpenWrt collector 指标族、最近样本和缺失建议。"
        action={
          <NetworkRouterConfigDrawer
            view="monitoring"
            provider={provider}
            devices={devices}
            canWrite={canWrite}
            canViewRaw={canViewRaw}
            triggerLabel="接管采集配置"
          />
        }
      />

      {monitoringHints.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <p className="font-semibold">监控补全建议</p>
          <ul className="mt-2 grid gap-1">
            {monitoringHints.map((hint) => (
              <li key={hint}>- {hint}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <TableCard>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">指标族</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">状态</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-slate-800">说明</TableHead>
                <TableHead className="min-w-[160px] font-semibold text-slate-800">最近样本</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={5} label="正在检查监控采集覆盖..." />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={5} label={emptyLabel} />
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.provider}:${row.family}`} className="border-slate-100">
                    <TableCell>
                      <ProviderBadge provider={row.provider} />
                    </TableCell>
                    <TableCell className="font-medium text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <Gauge className="h-4 w-4 text-cyan-700" />
                        {row.family}
                      </span>
                    </TableCell>
                    <TableCell>
                      <NetworkStatusBadge ok={row.ok} label={row.ok ? "健康" : undefined} pendingLabel="待确认" />
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.detail}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.sampleTime ? formatDateTime(row.sampleTime) : "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TableCard>
    </div>
  );
}
