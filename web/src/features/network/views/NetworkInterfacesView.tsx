import { Cable } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { EmptyTableRow, formatRate, LoadingTableRow } from "@/features/network/components/NetworkOpsPrimitives";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkDevice, NetworkInterfaceRow, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard, ViewToolbar } from "./NetworkViewPrimitives";

export function NetworkInterfacesView({
  rows,
  loading,
  emptyLabel,
  devices,
  provider,
  canWrite,
  canViewRaw,
}: {
  rows: NetworkInterfaceRow[];
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
        title="接口清单"
        description="按 WAN、LAN、桥接和物理口组织接口状态，吞吐只作为排障参考。"
        action={
          <NetworkRouterConfigDrawer
            view="interfaces"
            provider={provider}
            devices={devices}
            canWrite={canWrite}
            canViewRaw={canViewRaw}
            triggerLabel="接管接口配置"
          />
        }
      />
      <TableCard>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">分组</TableHead>
                <TableHead className="min-w-[160px] font-semibold text-slate-800">接口</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">地址</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">状态</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-slate-800">说明</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">吞吐</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={7} label="正在读取接口数据..." />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={7} label={emptyLabel} />
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.provider}:${row.name}:${row.address}`} className="border-slate-100">
                    <TableCell>
                      <ProviderBadge provider={row.provider} />
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{row.group || "未分组"}</TableCell>
                    <TableCell className="font-medium text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <Cable className="h-4 w-4 text-cyan-700" />
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{row.address}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.state}</TableCell>
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
