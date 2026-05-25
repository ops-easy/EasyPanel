import React from "react";
import { Button } from "@/shared/ui/button";
import NetworkRouterConfigDrawer from "@/features/network/router-config/NetworkRouterConfigDrawer";
import type { NetworkDevice, NetworkResourceView, ProviderKey } from "@/features/network/model/networkTypes";

type ButtonVariant = React.ComponentProps<typeof Button>["variant"];
type ButtonSize = React.ComponentProps<typeof Button>["size"];

export default function NetworkConfigEditor({
  view,
  provider,
  devices,
  canWrite,
  canViewRaw,
  triggerLabel = "路由器配置接管",
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName = "h-9 gap-2",
}: {
  view: NetworkResourceView;
  provider: ProviderKey;
  devices: NetworkDevice[];
  canWrite: boolean;
  canViewRaw: boolean;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
}) {
  return (
    <NetworkRouterConfigDrawer
      view={view}
      provider={provider}
      devices={devices}
      canWrite={canWrite}
      canViewRaw={canViewRaw}
      triggerLabel={triggerLabel}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      triggerClassName={triggerClassName}
    />
  );
}
