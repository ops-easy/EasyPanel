import { Shield } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { EmptyTableRow, LoadingTableRow } from "@/features/network/components/NetworkOpsPrimitives";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkDevice, NetworkFirewallGroup, ProviderKey } from "@/features/network/model/networkTypes";
import { ProviderBadge, TableCard, ViewToolbar } from "./NetworkViewPrimitives";

export function NetworkFirewallView({
  groups,
  loading,
  emptyLabel,
  devices,
  provider,
  canWrite,
  canViewRaw,
}: {
  groups: NetworkFirewallGroup[];
  loading: boolean;
  emptyLabel: string;
  devices: NetworkDevice[];
  provider: ProviderKey;
  canWrite: boolean;
  canViewRaw: boolean;
}) {
  const rowCount = groups.reduce((sum, group) => sum + group.rows.length, 0);
  return (
    <div className="grid min-w-0 gap-3">
      <ViewToolbar
        title="防火墙与连接跟踪"
        description="这里展示默认策略、防火墙区域、区域转发、端口转发、访问规则、NAT 和连接跟踪，不再直接摊开底层 UCI 键。"
        action={
          <NetworkRouterConfigDrawer
            view="connections"
            provider={provider}
            devices={devices}
            canWrite={canWrite}
            canViewRaw={canViewRaw}
            triggerLabel="接管防火墙配置"
          />
        }
      />
      <TableCard>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-200 bg-slate-50/95 hover:bg-slate-50/95">
                <TableHead className="w-[110px] font-semibold text-slate-800">来源</TableHead>
                <TableHead className="min-w-[220px] font-semibold text-slate-800">对象</TableHead>
                <TableHead className="min-w-[150px] font-semibold text-slate-800">类别</TableHead>
                <TableHead className="min-w-[190px] font-semibold text-slate-800">策略/端口</TableHead>
                <TableHead className="min-w-[280px] font-semibold text-slate-800">说明</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingTableRow colSpan={5} label="正在读取防火墙与连接数据..." />
              ) : rowCount === 0 ? (
                <EmptyTableRow colSpan={5} label={emptyLabel} />
              ) : (
                groups.flatMap((group) => [
                  <TableRow key={`group:${group.key}:${group.title}`} className="border-slate-100 bg-slate-50/60 hover:bg-slate-50/60">
                    <TableCell colSpan={5} className="py-3 text-sm font-semibold text-slate-900">
                      <span className="inline-flex items-center gap-2">
                        <Shield className="h-4 w-4 text-cyan-700" />
                        {group.title}
                      </span>
                    </TableCell>
                  </TableRow>,
                  ...group.rows.map((row) => (
                    <TableRow key={`${group.key}:${row.provider}:${row.name}:${row.kind}:${row.value}`} className="border-slate-100">
                      <TableCell>
                        <ProviderBadge provider={row.provider} />
                      </TableCell>
                      <TableCell className="font-medium text-slate-950">{row.name}</TableCell>
                      <TableCell className="text-sm text-slate-700">{row.kind}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{row.value}</TableCell>
                      <TableCell className="text-sm text-slate-600">{row.detail}</TableCell>
                    </TableRow>
                  )),
                ])
              )}
            </TableBody>
          </Table>
        </div>
      </TableCard>
    </div>
  );
}
