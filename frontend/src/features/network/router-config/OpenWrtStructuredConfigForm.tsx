import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import type { NetworkConfigDomain } from "@/features/network/model/networkTypes";

export type OpenWrtStructuredState = {
  operation: string;
  uciKey: string;
  value: string;
  reload: string;
};

const reloadOptions = [
  { value: "none", label: "不重载" },
  { value: "network", label: "重载 network" },
  { value: "wifi", label: "重载 Wi-Fi" },
  { value: "dnsmasq", label: "重启 dnsmasq" },
  { value: "firewall", label: "重载 firewall" },
];

function placeholderFor(domain: NetworkConfigDomain): string {
  if (domain === "interfaces") return "network.lan.ipaddr";
  if (domain === "dhcp") return "dhcp.lan.limit";
  if (domain === "wireless") return "wireless.default_radio0.ssid";
  if (domain === "dns") return "dhcp.@dnsmasq[0].server";
  if (domain === "connections") return "firewall.@redirect[0].dest_port";
  if (domain === "services") return "service.network";
  return "network.lan.ipaddr";
}

export function OpenWrtStructuredConfigForm({
  domain,
  value,
  disabled,
  onChange,
}: {
  domain: NetworkConfigDomain;
  value: OpenWrtStructuredState;
  disabled?: boolean;
  onChange: (next: OpenWrtStructuredState) => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-xs leading-5 text-slate-500">
        结构化入口覆盖接口地址、DHCP、无线、防火墙、DNS 和服务操作；复杂项可切到高级模式。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>操作</Label>
          <Select value={value.operation} onValueChange={(operation) => onChange({ ...value, operation })} disabled={disabled}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="set">设置 / 编辑</SelectItem>
              <SelectItem value="delete">删除</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>应用后动作</Label>
          <Select value={value.reload} onValueChange={(reload) => onChange({ ...value, reload })} disabled={disabled}>
            <SelectTrigger className="bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {reloadOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>配置项</Label>
        <Input
          value={value.uciKey}
          onChange={(event) => onChange({ ...value, uciKey: event.target.value })}
          placeholder={placeholderFor(domain)}
          className="font-mono text-sm"
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2">
        <Label>值</Label>
        <Input
          value={value.value}
          onChange={(event) => onChange({ ...value, value: event.target.value })}
          placeholder={domain === "interfaces" ? "192.168.2.1" : "按配置项填写"}
          disabled={disabled || value.operation === "delete"}
        />
      </div>
    </div>
  );
}
