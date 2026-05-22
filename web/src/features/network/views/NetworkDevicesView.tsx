import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import NetworkConfigEditor from "@/features/network/pages/NetworkConfigEditor";
import { EmptyTableRow, formatDateTime, LoadingTableRow } from "@/features/network/components/NetworkOpsPrimitives";
import type { NetworkDevice, NetworkDeviceRow, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard } from "./NetworkViewPrimitives";

export function NetworkDevicesView({
  rows,
  loading,
  emptyLabel,
  devices,
  canWrite,
  canViewRaw,
}: {
  rows: NetworkDeviceRow[];
  loading: boolean;
  emptyLabel: string;
  devices: NetworkDevice[];
  provider: ProviderKey;
  canWrite: boolean;
  canViewRaw: boolean;
}) {
  return (
    <TableCard>
      <div className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
              <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
              <TableHead className="min-w-[180px] font-semibold text-slate-800">名称</TableHead>
              <TableHead className="min-w-[170px] font-semibold text-slate-800">管理地址/数据源</TableHead>
              <TableHead className="min-w-[120px] font-semibold text-slate-800">状态</TableHead>
              <TableHead className="min-w-[220px] font-semibold text-slate-800">摘要</TableHead>
              <TableHead className="min-w-[160px] font-semibold text-slate-800">最近更新</TableHead>
              <TableHead className="w-[130px] text-right font-semibold text-slate-800">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingTableRow colSpan={7} label="正在读取设备接入状态..." />
            ) : rows.length === 0 ? (
              <EmptyTableRow colSpan={7} label={emptyLabel} />
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.provider}:${row.id}`} className="border-slate-100">
                  <TableCell>
                    <ProviderBadge provider={row.provider} />
                  </TableCell>
                  <TableCell className="font-medium text-slate-950">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{row.address}</TableCell>
                  <TableCell className="text-sm text-slate-700">{row.status}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.detail}</TableCell>
                  <TableCell className="text-sm text-slate-600">{row.updatedAt ? formatDateTime(row.updatedAt) : "-"}</TableCell>
                  <TableCell className="text-right">
                    <NetworkConfigEditor
                      view="devices"
                      provider={row.provider}
                      devices={devices}
                      canWrite={canWrite}
                      canViewRaw={canViewRaw}
                      triggerLabel="路由器配置"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TableCard>
  );
}
