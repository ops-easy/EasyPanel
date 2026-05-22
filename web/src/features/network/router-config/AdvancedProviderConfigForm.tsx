import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import type { NetworkDeviceKind } from "@/features/network/components/networkDeviceSingleton";

export type AdvancedProviderConfigState = {
  uciKey: string;
  value: string;
  funcName: string;
  action: string;
  paramText: string;
};

export function AdvancedProviderConfigForm({
  provider,
  value,
  disabled,
  onChange,
}: {
  provider: NetworkDeviceKind;
  value: AdvancedProviderConfigState;
  disabled?: boolean;
  onChange: (next: AdvancedProviderConfigState) => void;
}) {
  if (provider === "openwrt") {
    return (
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label>UCI 配置项</Label>
          <Input
            value={value.uciKey}
            onChange={(event) => onChange({ ...value, uciKey: event.target.value })}
            placeholder="network.lan.ipaddr"
            className="font-mono text-sm"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-2">
          <Label>值</Label>
          <Input
            value={value.value}
            onChange={(event) => onChange({ ...value, value: event.target.value })}
            placeholder="192.168.2.1"
            disabled={disabled}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>iKuai func_name</Label>
          <Input
            value={value.funcName}
            onChange={(event) => onChange({ ...value, funcName: event.target.value })}
            placeholder="wan / dhcp_server / port_map"
            disabled={disabled}
          />
        </div>
        <div className="grid gap-2">
          <Label>iKuai action</Label>
          <Input
            value={value.action}
            onChange={(event) => onChange({ ...value, action: event.target.value })}
            placeholder="show / edit / add / del"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>参数</Label>
        <Textarea
          value={value.paramText}
          onChange={(event) => onChange({ ...value, paramText: event.target.value })}
          placeholder='{"id":1,"comment":"office"}'
          className="min-h-24 font-mono text-sm"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
