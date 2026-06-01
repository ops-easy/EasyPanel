import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppConfig } from "@/hooks/use-app-config";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/shared/ui/accordion";
import { apiGetJson } from "@/lib/api";
import type { VCenterConsoleHtmlResponse, VCenterWebmksResponse } from "./types";

const VCenterConsolePanel: React.FC<{ moref: string }> = ({ moref }) => {
  const cfgQ = useAppConfig();

  const consoleHtmlQ = useQuery({
    queryKey: ["vcenter-console-html", moref],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterConsoleHtmlResponse>(
        `/api/vcenter/vms/${encodeURIComponent(moref)}/console-html`
      , { signal }),
  });

  const webmksQ = useQuery({
    queryKey: ["vcenter-webmks", moref],
    queryFn: ({ signal }) =>
      apiGetJson<VCenterWebmksResponse>(
        `/api/vcenter/vms/${encodeURIComponent(moref)}/webmks`
      , { signal }),
  });

  const proxyWsUrl = useMemo(() => {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/api/vcenter/vms/${encodeURIComponent(moref)}/console-ws`;
  }, [moref]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const cfg = cfgQ.data;
  const loginUrl = cfg?.vcenterUiLoginUrl ?? "";
  const consoleUrl = consoleHtmlQ.data?.url;
  const clientVmUrl = consoleHtmlQ.data?.vsphereClientUrl;
  const platformConsolePath = `/cluster/bastion/console/${encodeURIComponent(moref)}`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-4 text-sm text-gray-800">
        <p className="font-medium text-gray-900">推荐：站内 WebMKS 控制台</p>
        <p className="mt-2 text-gray-700">
          平台后端会使用已保存的 vCenter 连接生成控制台 ticket，并通过同源 WebSocket
          代理到浏览器。正常运维场景优先在 EasyPanel 内完成控制台操作，不需要先进入 vSphere Client。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild type="button" className="bg-blue-600 hover:bg-blue-700">
            <Link to={platformConsolePath}>打开站内 WebMKS 控制台</Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => copy(proxyWsUrl)}>
            复制同源代理地址
          </Button>
        </div>
      </div>

      {consoleHtmlQ.isLoading && (
        <p className="text-sm text-gray-500">正在生成控制台链接…</p>
      )}
      {consoleHtmlQ.error && (
        <p className="text-sm text-red-600">
          {(consoleHtmlQ.error as Error).message}
        </p>
      )}
      {consoleHtmlQ.data?.hint && (
        <p className="text-xs text-gray-600">{consoleHtmlQ.data.hint}</p>
      )}

      {(loginUrl || clientVmUrl || consoleUrl) && (
        <Accordion type="single" collapsible className="rounded-lg border border-gray-200">
          <AccordionItem value="official-links">
            <AccordionTrigger className="px-4 text-sm">
              备用：vSphere 官方链接（排障）
            </AccordionTrigger>
            <AccordionContent className="space-y-3 px-4 pb-4 text-sm text-gray-600">
              <p className="text-xs leading-relaxed text-gray-500">
                仅在站内 WebMKS SDK、CSP 或 SSO 链路需要排查时使用。以下链接不作为日常主路径，
                避免把虚拟机控制台操作重新分散回 vCenter 后台。
              </p>
              {loginUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(loginUrl)}>
                    复制 vCenter 登录链接
                  </Button>
                  <span className="break-all text-xs text-gray-500">{loginUrl}</span>
                </div>
              ) : null}
              {clientVmUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(clientVmUrl)}>
                    复制虚拟机摘要深链
                  </Button>
                  <span className="break-all text-xs text-gray-500">{clientVmUrl}</span>
                </div>
              ) : null}
              {consoleUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(consoleUrl)}>
                    复制 webconsole 链接
                  </Button>
                  <span className="break-all text-xs text-gray-500">{consoleUrl}</span>
                </div>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      <Accordion type="single" collapsible className="rounded-lg border border-gray-200">
        <AccordionItem value="adv">
          <AccordionTrigger className="px-4 text-sm">
            高级：WebMKS 直连 / 同源代理（可选）
          </AccordionTrigger>
          <AccordionContent className="space-y-3 px-4 pb-4 text-sm text-gray-600">
            <p>
              仅在需要排查或自建 WMKS 客户端时使用。同源 WebSocket：{" "}
              <code className="break-all rounded bg-gray-100 px-1 text-xs">
                {proxyWsUrl}
              </code>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(proxyWsUrl)}
              >
                复制代理地址
              </Button>
              {webmksQ.data?.wssUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(webmksQ.data.wssUrl)}
                >
                  复制直连 ESXi wssUrl
                </Button>
              )}
            </div>
            {webmksQ.data?.hint && (
              <p className="text-xs">{webmksQ.data.hint}</p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default VCenterConsolePanel;
