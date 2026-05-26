import { Wifi } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { EmptyTableRow, LoadingTableRow } from "@/features/network/components/NetworkOpsPrimitives";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkDevice, NetworkWirelessRow, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard, ViewToolbar } from "./NetworkViewPrimitives";

const categoryLabel = {
  radio: "Radio",
  ssid: "SSID",
  station: "关联终端",
};

export function NetworkWirelessView({
  rows,
  loading,
  emptyLabel,
  devices,
  provider,
  canWrite,
  canViewRaw,
}: {
  rows: NetworkWirelessRow[];
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
        title="无线对象"
        description="把 Radio、SSID 和关联终端拆成可读对象；未开启无线时显示清晰空态。"
        action={
          <NetworkRouterConfigDrawer
            view="wireless"
            provider={provider}
            devices={devices}
            canWrite={canWrite}
            canViewRaw={canViewRaw}
            triggerLabel="接管无线配置"
          />
        }
      />
      <TableCard>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">类型</TableHead>
                <TableHead className="min-w-[180px] font-semibold text-slate-800">对象</TableHead>
                <TableHead className="min-w-[160px] font-semibold text-slate-800">接口/Radio</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">状态</TableHead>
                <TableHead className="min-w-[120px] font-semibold text-slate-800">信号</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-slate-800">说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={7} label="正在读取无线状态..." />
              ) : rows.length === 0 ? (
                <EmptyTableRow colSpan={7} label={emptyLabel} />
              ) : (
                rows.map((row) => (
                  <TableRow key={`${row.provider}:${row.category}:${row.name}:${row.radio}`} className="border-slate-100">
                    <TableCell>
                      <ProviderBadge provider={row.provider} />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-white text-slate-600">
                        {categoryLabel[row.category || "ssid"]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-slate-950">
                      <span className="inline-flex items-center gap-2">
                        <Wifi className="h-4 w-4 text-cyan-700" />
                        {row.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">{row.radio}</TableCell>
                    <TableCell className="text-sm text-slate-700">{row.state}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.signal}</TableCell>
                    <TableCell className="text-sm text-slate-600">{row.detail}</TableCell>
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
