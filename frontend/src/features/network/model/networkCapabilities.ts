import { deviceQueryHint, type NetworkDeviceKind } from "@/features/network/components/networkDeviceSingleton";
import type { NetworkDevice, NetworkProviderCapability, OpenWrtStatus } from "./networkTypes";

type IkuaiStatus = { prometheusConfigured?: boolean; exporterKind?: string; note?: string };

export function buildNetworkProviderCapability(
  provider: NetworkDeviceKind,
  device?: NetworkDevice,
  status?: OpenWrtStatus | IkuaiStatus
): NetworkProviderCapability {
  const configured = Boolean(device);
  const hasCredentials =
    provider === "ikuai"
      ? Boolean(device?.username && (device?.passwordSet || device?.authType === "http-web"))
      : Boolean(device?.passwordSet || device?.privateKeySet);
  const address = provider === "ikuai" ? deviceQueryHint(device) : device?.host || device?.apiUrl || "未配置";

  if (provider === "ikuai") {
    const ikuaiStatus = status as IkuaiStatus | undefined;
    return {
      provider,
      configured,
      address,
      credentials: hasCredentials ? "saved" : "missing",
      management: [
        {
          key: "http-api",
          label: "HTTP API",
          ok: configured && hasCredentials,
          detail: configured ? "用于读取和写入 iKuai 配置" : "未接入",
        },
        {
          key: "terminal-policy",
          label: "终端备注/限速",
          ok: configured && hasCredentials,
          detail: "依赖 iKuai Web/API 能力",
        },
      ],
      monitoring: [
        {
          key: "prometheus",
          label: "Prometheus",
          ok: configured && ikuaiStatus?.prometheusConfigured !== false,
          detail: ikuaiStatus?.note || "用于接口、终端和连接数",
        },
        {
          key: "exporter",
          label: "Exporter",
          ok: Boolean(ikuaiStatus?.exporterKind && ikuaiStatus.exporterKind !== "unknown"),
          detail: ikuaiStatus?.exporterKind || "待探测",
        },
      ],
    };
  }

  const openWrtStatus = status as OpenWrtStatus | undefined;
  return {
    provider,
    configured,
    address,
    credentials: hasCredentials ? "saved" : "missing",
    management: [
      { key: "ssh", label: "SSH", ok: configured && hasCredentials, detail: "用于 ubus/UCI/服务操作" },
      { key: "ubus", label: "ubus", ok: configured && hasCredentials, detail: "用于系统、接口、DHCP/邻居读取" },
      { key: "uci", label: "UCI", ok: configured && hasCredentials, detail: "用于接口、无线、防火墙、dnsmasq 配置" },
    ],
    monitoring: [
      { key: "system", label: "系统指标", ok: Boolean(openWrtStatus?.families?.system), detail: "node exporter lua" },
      { key: "interfaces", label: "接口指标", ok: Boolean(openWrtStatus?.families?.interfaces), detail: "network collector" },
      { key: "dhcp", label: "DHCP/邻居", ok: Boolean(openWrtStatus?.families?.dhcp), detail: "openwrt collector" },
      { key: "wifi", label: "Wi-Fi", ok: Boolean(openWrtStatus?.families?.wifi), detail: "wifi collector" },
      { key: "netstat", label: "连接跟踪", ok: Boolean(openWrtStatus?.families?.netstat), detail: "netstat collector" },
    ],
  };
}

export function capabilityOkCount(capability?: NetworkProviderCapability): number {
  if (!capability) return 0;
  return [...capability.management, ...capability.monitoring].filter((item) => item.ok).length;
}
