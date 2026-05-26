import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/auth/auth-context";
import { apiGetJson } from "@/lib/api";
import { singleNetworkDeviceByKind } from "@/features/network/components/networkDeviceSingleton";
import type { NetworkDevice } from "@/features/network/model/networkTypes";

export function useNetworkDevices() {
  const { status } = useAuth();
  const canWrite = status?.role === "admin" || status?.permissions?.network === "rw";
  const canViewRaw = status?.role === "admin";
  const query = useQuery({
    queryKey: ["network-devices"],
    queryFn: ({ signal }) => apiGetJson<{ devices: NetworkDevice[] }>("/api/network/devices", { signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const devices = useMemo(() => query.data?.devices ?? [], [query.data?.devices]);
  return {
    query,
    devices,
    ikuaiDevice: singleNetworkDeviceByKind(devices, "ikuai") as NetworkDevice | undefined,
    openWrtDevice: singleNetworkDeviceByKind(devices, "openwrt") as NetworkDevice | undefined,
    canWrite,
    canViewRaw,
  };
}
