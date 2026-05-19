import { API_BASE } from "./client";

export function wsUrlForApiPath(path: string): string {
  const base = API_BASE.trim();
  if (base.startsWith("http://")) return "ws://" + base.slice(7) + path;
  if (base.startsWith("https://")) return "wss://" + base.slice(8) + path;
  if (typeof window === "undefined") return `ws://localhost${path}`;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}
