import { Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { EmptyTableRow, formatRate, LoadingTableRow } from "@/features/network/components/NetworkOpsPrimitives";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkClientRow, NetworkDevice, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard, ViewToolbar } from "./NetworkViewPrimitives";

export function NetworkClientsView({
  rows,
  loading,
  emptyLabel,
  devices,
  provider,
  canWrite,
  canViewRaw,
}: {
  rows: NetworkClientRow[];
  loading: boolean;
  emptyLabel: string;
  devices: NetworkDevice[];
  provider: ProviderKey;
  canWrite: boolean;
  canViewRaw: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <ViewToolbar
        title="终端清单"
        description="聚合 DHCP、邻居表和 iKuai 终端流量，日常查 IP、MAC、备注和流量从这里进入。"
        action={
          <NetworkRouterConfigDrawer
            view="clients"
            provider={provider}
            devices={devices}
            canWrite={canWrite}
            canViewRaw={canViewRaw}
            triggerLabel="配置终端策略"
          />
        }
      />
      <TableCard>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">终端</TableHead>
                <TableHead className="min-w-[140px] font-semibold text-slate-800">IP</TableHead>
                <TableHead className="min-w-[160px] font-semibold text-slate-800">MAC</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-slate-800">说明</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">流量</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={6} label="正在读取终端数据..." />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={6} label={emptyLabel} />
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.provider}:${row.ip}:${row.mac}:${row.name}`} className="border-slate-100">
                    <TableCell>
                      <ProviderBadge provider={row.provider} />
                    </TableCell>
                    <TableCell className="font-medium text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <Users className="h-4 w-4 text-cyan-700" />
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{row.ip}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{row.mac}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.detail}</TableCell>
                    <TableCell className="text-sm tabular-nums text-slate-600">
                      RX {formatRate(row.rx, row.rateUnit)} / TX {formatRate(row.tx, row.rateUnit)}
                    </TableCell>
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
