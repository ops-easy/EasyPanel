import { useMemo } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import type { ITerminalOptions } from "@xterm/xterm";
import { resolveEasyPanelXtermOptions } from "@/lib/xtermShared";

export function useEasyPanelXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  return useMemo(() => resolveEasyPanelXtermOptions(data ?? undefined), [data]);
}
