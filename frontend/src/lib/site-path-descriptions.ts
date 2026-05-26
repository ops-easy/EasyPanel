/**
 * 站点统计「访问最多路径」旁的中文说明（按路径匹配，先长后短）。
 */
export function describeSitePath(raw: string): string {
  const normalizedRaw = raw.trim();
  const path = normalizeSitePath(normalizedRaw);

  const exact: Record<string, string> = {
    "/": "前端首页（SPA）",
    "/api/audit/site-stats": "站点统计 JSON（本页数据）",
    "/api/audit/harbor-dashboard": "Harbor 代理统计、远端 statistics 与最近访问日志（管理员）",
    "/api/auth/status": "登录态与权限、MySQL 连接状态",
    "/api/config": "合并后的运行时配置（脱敏）",
    "/api/runtime/status": "运行时健康与依赖摘要",
    "/api/system/check": "系统自检（K8s、组件等）",
  };
  if (exact[path]) return exact[path];

  const rules: { test: RegExp; desc: string }[] = [
    { test: /^\/api\/ops\/grafana\/dashboards\/[^/]+$/, desc: "拉取已同步的某一 Grafana 看板 JSON" },
    {
      test: /^\/api\/ops\/vmlog\//,
      desc: "AI 巡检：VictoriaLogs 状态、LogsQL 查询代理、虚拟机 Vector 采集脚本生成/SSH 下发",
    },
    { test: /^\/api\/ops\/grafana\//, desc: "AI 巡检：Grafana 连接、看板列表与同步" },
    { test: /^\/api\/ops\/ai-provider/, desc: "AI 巡检：AI Provider / 大模型接口配置" },
    { test: /^\/api\/ops\/inspect\//, desc: "AI 巡检：执行巡检或读取报告" },
    { test: /^\/api\/ops\/alerts/, desc: "AI 巡检：告警规则与通知通道" },
    { test: /^\/api\/ops\//, desc: "运维中心相关 API" },
    { test: /^\/api\/harbor\//, desc: "Harbor 仓库代理（状态、统计、项目/仓库/制品列表）" },
    { test: /^\/api\/audit\//, desc: "审计日志或统计" },
    { test: /^\/api\/auth\//, desc: "登录、OIDC、会话" },
    { test: /^\/api\/prometheus\//, desc: "Prometheus 查询或代理" },
    { test: /^\/api\/k8s\/pods\/[^/]+\/[^/]+\/exec\/ws/, desc: "Pod WebSocket 终端" },
    { test: /^\/api\/k8s\/pods\//, desc: "Pod 详情、日志、指标或删除" },
    { test: /^\/api\/k8s\/pvc-files\//, desc: "PVC 内文件浏览与读写" },
    { test: /^\/api\/k8s\//, desc: "Kubernetes 资源列表或汇总" },
    { test: /^\/api\/vcenter\//, desc: "vCenter / ESXi / 虚拟机相关" },
    { test: /^\/api\/pve\//, desc: "PVE / Proxmox VE 纳管" },
    { test: /^\/api\/network\//, desc: "网络设备（iKuai / OpenWrt）" },
    { test: /^\/api\/cloud-hosts\//, desc: "云主机与 SSH" },
    { test: /^\/api\/app-center\//, desc: "应用中心（Redis、OpenSearch、云主机、OpenClaw、Hermes 等）" },
    { test: /^\/api\/settings\//, desc: "运行时设置读写" },
    { test: /^\/api\/admin-users\//, desc: "平台用户管理" },
    { test: /^\/api\/ingress/, desc: "Ingress 列表或发布" },
    { test: /^\/api\/host\//, desc: "宿主通知或安全提示已读" },
    { test: /^\/api\//, desc: "其它后端 API" },
    { test: /^\/assets\//, desc: "前端静态资源（JS/CSS）" },
  ];
  for (const { test, desc } of rules) {
    if (test.test(path)) return desc;
  }

  if (!path.startsWith("/api/")) {
    const appCenterDesc = describeAppCenterSpaPath(path, normalizedRaw);
    if (appCenterDesc) return appCenterDesc;

    const spa: { test: RegExp; desc: string }[] = [
      { test: /^\/account\/site-stats/, desc: "前端：站点统计页" },
      { test: /^\/account\/audit/, desc: "前端：平台审计" },
      { test: /^\/account\//, desc: "前端：账号与平台设置" },
      { test: /^\/cluster\/ai-inspect\//, desc: "前端：AI 巡检（监控/告警/日志）" },
      { test: /^\/ai-inspect/, desc: "前端：AI 巡检（监控/告警）" },
      { test: /^\/cluster\/compute/, desc: "前端：虚拟化与主机" },
      { test: /^\/cluster\/network/, desc: "前端：网络设备" },
      { test: /^\/cluster\//, desc: "前端：Kubernetes 集群" },
      { test: /^\/vcenter\//, desc: "前端：vCenter / 云主机" },
      { test: /^\/login/, desc: "前端：登录页" },
      { test: /^\/setup/, desc: "前端：初始化向导" },
    ];
    for (const { test, desc } of spa) {
      if (test.test(path)) return desc;
    }
    return "前端页面路由（SPA）";
  }

  return "HTTP 请求路径";
}

function normalizeSitePath(raw: string): string {
  const withoutQueryOrHash = (raw.split(/[?#]/)[0] || raw || "/").trim();
  return withoutQueryOrHash.replace(/\/+$/, "") || "/";
}

function safeDecodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function queryValue(raw: string, ...keys: string[]): string {
  const queryStart = raw.indexOf("?");
  if (queryStart < 0) return "";
  const hashStart = raw.indexOf("#", queryStart);
  const query = raw.slice(queryStart + 1, hashStart >= 0 ? hashStart : undefined);
  const params = new URLSearchParams(query);
  for (const key of keys) {
    const value = params.get(key)?.trim();
    if (value) return value;
  }
  return "";
}

function describeAppCenterSpaPath(path: string, raw: string): string | null {
  const match = path.match(/^\/(?:cluster\/apps|app-center)(?:\/(.*))?$/);
  if (!match) return null;

  const parts = (match[1] ?? "").split("/").filter(Boolean);
  const [module, second, third, fourth] = parts;
  const queryInstance = queryValue(raw, "instance", "instanceId", "id");
  if (!module || module === "dashboard") {
    return "前端：应用中心总览（Redis、MySQL、Kafka、OpenClaw、Hermes 等实例概览）";
  }

  if (module === "redis") {
    if (queryInstance) return `前端：应用中心 · Redis 实例 ${queryInstance} 详情`;
    if (second) return `前端：应用中心 · Redis 实例 ${safeDecodePathSegment(second)} 详情`;
    return "前端：应用中心 · Redis 实例列表、部署向导与模板中心";
  }

  if (module === "mysql") {
    if (queryInstance) return `前端：应用中心 · MySQL 实例 ${queryInstance} 详情（SQL、用户与备份）`;
    if (second) return `前端：应用中心 · MySQL 实例 ${safeDecodePathSegment(second)} 详情（SQL、用户与备份）`;
    return "前端：应用中心 · MySQL 实例列表、部署向导、SQL、用户与备份";
  }

  if (module === "kafka") {
    if (second === "instance" && third) {
      const id = safeDecodePathSegment(third);
      if (fourth === "throttle") return `前端：应用中心 · Kafka 实例 ${id} 限速与配额管理`;
      return `前端：应用中心 · Kafka 实例 ${id} 管理（集群、Topic、消费者组、ACL、SCRAM、压测）`;
    }
    return "前端：应用中心 · Kafka 实例列表、部署向导与模板中心";
  }

  if (module === "hermes") {
    if (second === "create") return "前端：应用中心 · Hermes 新建实例";
    if (second === "bootstrap") return "前端：应用中心 · Hermes 部署初始化";
    if (second) return `前端：应用中心 · Hermes 实例 ${safeDecodePathSegment(second)} 详情`;
    return "前端：应用中心 · Hermes 实例列表";
  }

  if (module === "openclaw") {
    if (second === "create") return "前端：应用中心 · OpenClaw 新建实例";
    if (second === "bootstrap") return "前端：应用中心 · OpenClaw 部署初始化";
    if (second) return `前端：应用中心 · OpenClaw 实例 ${safeDecodePathSegment(second)} 详情与对话`;
    return "前端：应用中心 · OpenClaw 实例列表";
  }

  if (module === "opensearch") return "前端：应用中心 · OpenSearch 实例列表与部署";
  if (module === "dns") return "前端：应用中心 · DNS 解析、健康监测与 SSL 证书";
  if (module === "cloud-vm") {
    if (second === "create") return "前端：应用中心 · 容器主机新建实例";
    if (second === "bootstrap") return "前端：应用中心 · 容器主机部署初始化";
    if (second) return `前端：应用中心 · 容器主机实例 ${safeDecodePathSegment(second)} 详情`;
    return "前端：应用中心 · 容器主机实例列表";
  }

  return "前端：应用中心";
}
