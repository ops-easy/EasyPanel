/// <reference types="vite/client" />

/** 构建时注入，与后端 BuildVersion 对齐时请设置环境变量 VITE_UI_BUILD_VERSION */
declare const __EASYPANEL_UI_BUILD_VERSION__: string;

declare module "@novnc/novnc" {
  type RFBOptions = {
    credentials?: Record<string, string>;
    shared?: boolean;
    repeaterID?: string;
    wsProtocols?: string | string[];
  };

  export default class RFB extends EventTarget {
    constructor(target: HTMLElement, urlOrChannel: string | WebSocket, options?: RFBOptions);
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    qualityLevel: number;
    compressionLevel: number;
    clipViewport: boolean;
    dragViewport: boolean;
    focusOnClick: boolean;
    disconnect(): void;
    focus(): void;
    sendCtrlAltDel(): void;
    sendCredentials(credentials: Record<string, string>): void;
  }
}
