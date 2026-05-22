import { Label } from "@/shared/ui/label";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import type { NetworkConfigDomain } from "@/features/network/model/networkTypes";

export type IkuaiStructuredState = {
  operation: string;
  funcName: string;
  action: string;
  paramText: string;
};

function defaultFuncName(domain: NetworkConfigDomain): string {
  if (domain === "clients") return "host_bind";
  if (domain === "dhcp") return "dhcp_server";
  if (domain === "connections") return "port_map";
  if (domain === "interfaces") return "wan";
  if (domain === "monitoring") return "monitor";
  return "system";
}

export function IkuaiStructuredConfigForm({
  domain,
  value,
  disabled,
  onChange,
}: {
  domain: NetworkConfigDomain;
  value: IkuaiStructuredState;
  disabled?: boolean;
  onChange: (next: IkuaiStructuredState) => void;
}) {
  const suggested = defaultFuncName(domain);
  return (
    <div className="grid gap-4">
      <p className="text-xs leading-5 text-slate-500">
        结构化入口覆盖终端备注、限速、端口映射、DHCP 和基础 WAN/LAN 管理；固件不支持项会在预览中提示。
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
          <Label>接口动作</Label>
          <Input
            value={value.action}
            onChange={(event) => onChange({ ...value, action: event.target.value })}
            placeholder="show / edit / add / del"
            disabled={disabled}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>功能模块</Label>
        <Input
          value={value.funcName || suggested}
          onChange={(event) => onChange({ ...value, funcName: event.target.value })}
          placeholder={suggested}
          disabled={disabled}
        />
      </div>
      <div className="grid gap-2">
        <Label>参数</Label>
        <Textarea
          value={value.paramText}
          onChange={(event) => onChange({ ...value, paramText: event.target.value })}
          placeholder='{"id":1,"comment":"office","upload":"10M"}'
          className="min-h-24 font-mono text-sm"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
