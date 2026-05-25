export const DDNS_HELP = {
  hostLabel: "DDNS / 节点访问地址 ddnsHost",
  hostPlaceholder: "例如 edge.example.com、home-ddns.example.com 或 203.0.113.10",
  hostHint:
    "宝塔反代回源到集群入口时访问的主机名或节点 IP，不是业务域名 rules.host。通常填解析到公网入口节点的 DDNS 域名；没有 DDNS 时也可以填固定公网 IP、内网穿透域名或边缘节点地址。",
  defaultPortLabel: "默认 HTTP 回源端口 defaultPort",
  defaultPortPlaceholder: "例如 38333、80",
  defaultPortHint:
    "没有单条 Ingress 覆盖时，HTTP 回源默认访问 ddnsHost 的这个端口。它通常是 ingress-nginx 暴露在节点上的 HTTP NodePort；当前默认值 38333 来自部署示例。",
  upstreamHostLabel: "固定回源地址 baotaUpstreamHost（可选）",
  upstreamHostPlaceholder: "留空则回退到 ddnsHost",
  upstreamHostHint:
    "只在你不想让宝塔访问 ddnsHost 时填写；非空会优先作为宝塔反代的回源 host。",
  upstreamSchemeHint:
    "全局默认回源协议。未写 ddns-scheme 注解时使用这里；开启宝塔 HTTPS 的单条 Ingress 会默认切到 HTTPS 回源。",
  upstreamPortLabel: "固定回源端口 baotaUpstreamPort（可选）",
  upstreamPortPlaceholder: "留空则按协议走默认端口",
  upstreamPortHint:
    "非空时优先级高于 defaultPort 和 HTTPS 入口端口，适合宝塔永远回源到同一个固定端口的场景。",
  defaultBehavior:
    "默认回源：HTTP + ddnsHost + defaultPort。开启宝塔 HTTPS 后，如果没有写 ddns-scheme，回源会默认切到 HTTPS + HTTPS 入口端口；如果配置了 baotaUpstreamHost 或 baotaUpstreamPort，则优先使用固定回源。",
  ddnsPortAnnotation:
    "ddns-port 是单条 Ingress 的端口覆盖，只影响单条 Ingress 生成的宝塔反代，不会改全局 defaultPort。",
  ddnsSchemeAnnotation:
    "ddns-scheme 是单条 Ingress 的协议覆盖，只支持 http 或 https；写 https 时默认使用 HTTPS 入口端口，除非同一条 Ingress 也写了 ddns-port。",
  annotationSummary:
    "YAML 里的 ddns-port / ddns-scheme 只影响单条 Ingress。常规表单会尽量使用宝塔设置里的全局回源，不需要手写这两个注解。",
  publishIntro:
    "宝塔反代的默认回源由宝塔设置决定：先看 baotaUpstreamHost/baotaUpstreamPort，未配置时使用 ddnsHost 和 defaultPort。ddnsHost 是宝塔能访问到集群入口的地址，不是业务访问域名。",
} as const;
