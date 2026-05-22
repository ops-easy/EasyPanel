import { Cable, Gauge, RadioTower, ServerCog, Shield, Users, Wifi } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/lib/utils";
import type { NetworkConfigDomain } from "@/features/network/model/networkTypes";

export const routerConfigDomains: Array<{
  value: NetworkConfigDomain;
  label: string;
  description: string;
  icon: typeof Cable;
}> = [
  { value: "interfaces", label: "接口 / WAN / LAN", description: "地址、协议、网关与接口启停", icon: Cable },
  { value: "clients", label: "终端策略", description: "终端备注、静态租约与限速", icon: Users },
  { value: "dhcp", label: "DHCP", description: "地址池、租约、保留地址", icon: ServerCog },
  { value: "wireless", label: "无线", description: "Radio、SSID、加密与启停", icon: Wifi },
  { value: "dns", label: "DNS / dnsmasq", description: "上游 DNS 与 dnsmasq 参数", icon: RadioTower },
  { value: "connections", label: "防火墙 / NAT", description: "区域、规则、端口转发、NAT", icon: Shield },
  { value: "services", label: "服务操作", description: "网络、Wi-Fi、dnsmasq 等服务", icon: ServerCog },
  { value: "monitoring", label: "监控采集", description: "Exporter 与 collector 覆盖", icon: Gauge },
];

export function RouterConfigDomainPicker({
  value,
  onChange,
}: {
  value: NetworkConfigDomain;
  onChange: (domain: NetworkConfigDomain) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {routerConfigDomains.map((item) => {
        const Icon = item.icon;
        const active = value === item.value;
        return (
          <Button
            key={item.value}
            type="button"
            variant="outline"
            className={cn(
              "h-auto min-w-0 justify-start gap-3 rounded-lg border-slate-200 bg-white px-3 py-3 text-left",
              active && "border-cyan-300 bg-cyan-50 text-cyan-900"
            )}
            onClick={() => onChange(item.value)}
          >
            <Icon className="h-4 w-4 shrink-0 text-cyan-700" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">{item.description}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
