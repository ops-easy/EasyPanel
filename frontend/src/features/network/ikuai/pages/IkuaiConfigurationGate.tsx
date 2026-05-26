import React, { type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson, apiPostJson } from "@/lib/api";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import NetworkDeviceSetupPanel from "@/features/network/components/NetworkDeviceSetupPanel";
import { singleNetworkDeviceByKind } from "@/features/network/components/networkDeviceSingleton";

type NetworkDevice = {
  id: string;
  kind: "ikuai" | "openwrt";
  name: string;
  prometheusScope: string;
  instanceLabel?: string;
  jobLabel?: string;
  notes?: string;
};

const defaultForm = {
  kind: "ikuai",
  name: "iKuai",
  prometheusScope: "network",
  instanceLabel: "",
  jobLabel: "",
  notes: "",
};

export default function IkuaiConfigurationGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { status } = useAuth();
  const canWrite = status?.role === "admin";
  const [form, setForm] = React.useState(defaultForm);

  const devicesQ = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
  });

  const savedIkuaiDevice = singleNetworkDeviceByKind(
    (devicesQ.data?.devices ?? []).filter((device) => device.kind === "ikuai"),
    "ikuai"
  );

  const upsertIkuaiDevice = useMutation({
    mutationFn: () => apiPostJson<{ device: NetworkDevice }>("/api/network/devices", form),
    onSuccess: () => {
      toast.success("iKuai 实例已保存");
      setForm(defaultForm);
      void qc.invalidateQueries({ queryKey: ["network-devices"] });
    },
    onError: (e) => toast.error(String(e)),
  });

  if (devicesQ.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载网络设备...
      </div>
    );
  }

  if (devicesQ.error) {
    return (
      <NetworkDeviceSetupPanel
        kind="ikuai"
        mode="missing-device"
        title="无法读取网络设备配置"
        description={(devicesQ.error as Error).message}
        primaryLabel="返回网络设备"
        primaryTo="/cluster/network/dashboard"
        compact
      />
    );
  }

  if (savedIkuaiDevice) return <>{children}</>;

  return (
    <NetworkDeviceSetupPanel
      kind="ikuai"
      mode="missing-device"
      title="请先配置 iKuai 实例"
      description="iKuai 页面需要先保存 Prometheus scope、instance 或 job 标签。保存后，监控页会继续检查 ikuai_* 或 ikuai_client_* 指标。"
      secondaryLabel="返回网络总览"
      secondaryTo="/cluster/network/dashboard"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>显示名称</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Prometheus scope</Label>
          <Input
            value={form.prometheusScope}
            onChange={(e) => setForm({ ...form, prometheusScope: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>instance 标签</Label>
          <Input
            className="font-mono text-sm"
            value={form.instanceLabel}
            onChange={(e) => setForm({ ...form, instanceLabel: e.target.value })}
            placeholder="192.168.1.1:9100"
          />
        </div>
        <div className="space-y-1.5">
          <Label>job 标签</Label>
          <Input value={form.jobLabel} onChange={(e) => setForm({ ...form, jobLabel: e.target.value })} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label>备注</Label>
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <Button className="mt-4 gap-2" disabled={!canWrite || upsertIkuaiDevice.isPending} onClick={() => upsertIkuaiDevice.mutate()}>
        {upsertIkuaiDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        保存 iKuai 实例
      </Button>
    </NetworkDeviceSetupPanel>
  );
}
