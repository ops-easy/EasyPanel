import { useEffect, useMemo, useState } from "react";
import { useAppConfig } from "@/hooks/use-app-config";
import { EASYPANEL_SSH_APPEARANCE_EVENT, resolveSshEasyPanelXtermOptions } from "@/lib/xtermShared";
import type { ITerminalOptions } from "@xterm/xterm";

/** SSH 专用：服务端字体 + 本机终端配色；随堡垒机工具栏或它页触发的 appearance 事件更新 */
export function useSshEasyPanelXtermOptions(): ITerminalOptions {
  const { data } = useAppConfig();
  const [appearanceRev, setAppearanceRev] = useState(0);

  useEffect(() => {
    const onChange = () => setAppearanceRev((n) => n + 1);
    window.addEventListener(EASYPANEL_SSH_APPEARANCE_EVENT, onChange);
    return () => window.removeEventListener(EASYPANEL_SSH_APPEARANCE_EVENT, onChange);
  }, []);

  return useMemo(() => {
    void appearanceRev;
    return resolveSshEasyPanelXtermOptions(data ?? undefined);
  }, [data, appearanceRev]);
}
