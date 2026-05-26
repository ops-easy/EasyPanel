export type NetworkDeviceKind = "ikuai" | "openwrt";

export type SingletonNetworkDevice = {
  id: string;
  kind: NetworkDeviceKind;
  name: string;
  prometheusScope: string;
  instanceLabel?: string;
  jobLabel?: string;
};

export function singleNetworkDeviceByKind<T extends SingletonNetworkDevice>(
  devices: T[] | null | undefined,
  kind: NetworkDeviceKind
): T | undefined {
  return devices?.find((device) => device.kind === kind && Boolean(device.id)) ?? undefined;
}

export function deviceQueryHint(device: SingletonNetworkDevice | undefined): string {
  if (!device) return "未配置";
  const parts = [device.prometheusScope || "network", device.instanceLabel || "", device.jobLabel || ""].filter(Boolean);
  return parts.join(" / ") || "network";
}
