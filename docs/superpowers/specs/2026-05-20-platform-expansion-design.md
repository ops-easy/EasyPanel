# PVE、OpenWrt、Hermes 平台扩展设计

## 1. 背景

当前平台已经具备三类基础设施能力，但边界还不完全清晰：

- `vCenter`：已经实现虚拟机、ESXi 宿主机、WebMKS 控制台、SSH/SFTP、性能指标、GPU 看板、事件与堡垒机联动等能力。后端路由入口已在 `api/api/vcenter`，但实际实现仍大量委托给 `api/common/core` 下的旧代码。
- `iKuai`：已经实现基于 Prometheus 的只读监控能力，包括 Go 版 `ikuai_exporter` 与 Python 版 `ikuai_exporter` 指标兼容、LAN 客户端流量、协议流量、CPU/内存/接口等图表。但它当前挂在 `/cluster/vcenter/router`，实际是网络设备监控，不属于 vCenter。
- `OpenClaw`：已经作为应用中心的一等模块存在，具备 Bootstrap、K8s 部署、实例登记、网关探活、配置文件读写、上游模型配置、Secret 处理、RBAC preset、工具链 preset、OpenClaw 对话代理等能力。

本次扩展要增加：

- `PVE`：作为 `vCenter` 的同级虚拟化平台。
- `OpenWrt`：作为 `iKuai` 的同级网络设备。
- `Hermes`：作为 `OpenClaw` 的同级智能体应用，目标项目为 `NousResearch/hermes-agent`。

用户已明确要求：新增平台应做到与现有对应模块同等深度，即“原来做到什么程度就做到什么程度”。因此本设计以“同级能力线 + 小范围共享组件”为原则，不做一次性大插件化。

## 2. 外部事实与约束

### 2.1 Proxmox VE / PVE

Proxmox VE 提供 HTTPS REST-like API，默认服务地址为 `https://<host>:8006/api2/json/`。官方文档说明 API 使用 JSON，并支持 API Token 认证，Token Header 形如：

```text
Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID
```

因此本平台应优先支持 API Token，不要求用户提供浏览器 Cookie 或 CSRF Token。写操作使用 API Token 时也不需要 CSRF Header，适合自动化后台调用。

参考：<https://pve.proxmox.com/wiki/Proxmox_VE_API>

### 2.2 OpenWrt

OpenWrt 监控优先走 Prometheus。OpenWrt 官方软件包包含轻量级 Lua 版 Prometheus exporter，例如：

- `prometheus-node-exporter-lua`
- `prometheus-node-exporter-lua-openwrt`
- `prometheus-node-exporter-lua-netstat`
- `prometheus-node-exporter-lua-wifi`

因此 OpenWrt 第一版不直接依赖 LuCI 或 UCI 写配置，而是按 Prometheus 指标族探测实现只读监控。写配置属于后续阶段，因为当前 `iKuai` 也没有配置管理能力。

参考：

- <https://openwrt.org/packages/pkgdata/prometheus-node-exporter-lua>
- <https://openwrt.org/packages/pkgdata/prometheus-node-exporter-lua-openwrt>
- <https://openwrt.org/packages/pkgdata/prometheus-node-exporter-lua-netstat>
- <https://openwrt.org/packages/pkgdata/prometheus-node-exporter-lua-wifi>

### 2.3 Hermes

`NousResearch/hermes-agent` 是长期运行的智能体与消息网关，而不是 OpenClaw 的简单换镜像版本。README 中描述其能力包括：

- CLI 与 gateway 两类入口。
- Telegram、Discord、Slack、WhatsApp、Signal、Email 等消息平台网关。
- skills、memory、cron、MCP、工具集、终端后端。
- 从 OpenClaw 迁移的命令：`hermes claw migrate`。
- Dockerfile 中设置 `HERMES_HOME=/opt/data`，Docker Compose 中将 `~/.hermes` 挂载到容器 `/opt/data`。

因此 Hermes 应作为应用中心的独立模块，重点支持持久化目录、Gateway/Dashboard 模式、Secret 管理、K8s 部署、实例状态、配置文件管理与 OpenClaw 迁移入口。

参考：

- <https://github.com/NousResearch/hermes-agent>
- <https://raw.githubusercontent.com/NousResearch/hermes-agent/main/Dockerfile>
- <https://raw.githubusercontent.com/NousResearch/hermes-agent/main/docker-compose.yml>
- <https://raw.githubusercontent.com/NousResearch/hermes-agent/main/.env.example>

## 3. 设计目标

1. 新增 `PVE`，达到现有 `vCenter` 同级的第一版纳管深度：连接配置、探活、节点、VM/LXC、存储、任务、开关机操作。
2. 将 `iKuai` 从 vCenter 工作区迁出，升级为网络设备模块；保持旧路径兼容。
3. 新增 `OpenWrt`，达到当前 `iKuai` 的同等深度：Prometheus 只读监控、接口、客户端、流量、连接、无线指标的条件展示。
4. 新增 `Hermes`，达到 `OpenClaw` 同级应用中心深度：Bootstrap、K8s 部署、实例登记、状态探活、配置文件、Secret、重启、迁移入口。
5. 保持旧路由可用，避免用户收藏地址、文档链接、巡检入口在升级后失效。
6. 保持权限模型与审计风格一致：敏感信息不出现在列表响应中，写操作仅管理员可用，viewer 保持只读。
7. 不在本次引入大而全的 provider 插件系统，只抽取确实复用的薄工具层。

## 4. 非目标

1. 不在第一版实现 OpenWrt 的 LuCI/UCI 配置写入，例如防火墙规则、DHCP 静态租约、端口转发变更。
2. 不在第一版实现 iKuai 的配置写入，因为现有 iKuai 能力也只到监控。
3. 不在第一版实现 PVE NoVNC/WebSocket 控制台代理。第一版提供 PVE UI 控制台 URL 或跳转入口，后续再补平台内嵌控制台。
4. 不在第一版将所有 vCenter 后端代码彻底从 `common/core` 迁出。PVE 和 network 新模块应使用新结构，vCenter 迁移可以渐进完成。
5. 不将 Hermes 塞进 OpenClaw 的“部署模式”。两者是应用中心同级应用。

## 5. 总体信息架构

### 5.1 一级工作区

主侧栏维持“工作区”思路：

- 工作台
- Kubernetes
- 虚拟化与主机
- 网络设备
- 应用中心
- 堡垒机
- AI 巡检
- 文档中心
- 管理

`堡垒机` 保持一级入口，因为它是高频操作入口。`虚拟化与主机` 中也提供堡垒机关联入口，但不取消原入口。

### 5.2 虚拟化与主机工作区

前端路径前缀：

```text
/cluster/compute/*
```

二级导航：

| 菜单 | 路径 | 页面职责 |
| --- | --- | --- |
| 总览 | `/cluster/compute/dashboard` | 汇总 vCenter、PVE、公有云主机、宿主资源、异常连接、任务失败 |
| vCenter / 虚拟机 | `/cluster/compute/vcenter/vms` | 现有 vCenter VM 列表、VM 性能、SSH/SFTP/详情入口 |
| vCenter / 宿主机 | `/cluster/compute/vcenter/hosts` | 现有 ESXi host 列表与详情 |
| vCenter / GPU 监控 | `/cluster/compute/vcenter/gpu` | 现有 GPU Prometheus 看板 |
| vCenter / Prometheus 指标 | `/cluster/compute/vcenter/prometheus` | vCenter/ESXi/VM 指标自检 |
| vCenter / 设置 | `/cluster/compute/vcenter/settings` | 现有 vCenter 运行时设置 |
| PVE / 集群总览 | `/cluster/compute/pve/dashboard` | PVE target 总览、节点资源、VM/LXC 统计、任务异常 |
| PVE / 连接目标 | `/cluster/compute/pve/targets` | PVE 地址、Token、TLS、探活配置 |
| PVE / 节点 | `/cluster/compute/pve/nodes` | PVE nodes 列表、CPU/内存/磁盘状态 |
| PVE / VM/LXC | `/cluster/compute/pve/guests` | QEMU VM 与 LXC 列表、状态、开关机 |
| PVE / 存储 | `/cluster/compute/pve/storage` | storage 列表、容量、类型、节点归属 |
| PVE / 任务 | `/cluster/compute/pve/tasks` | 最近任务、失败原因、执行节点 |
| 云主机 | `/cluster/compute/cloud` | 现有公有云主机登记、SSH、SFTP、指标快照 |
| 工具 | `/cluster/compute/tools/ip-scan` | IP 扫描、端口探测等 |

旧路径兼容：

| 旧路径 | 新路径 |
| --- | --- |
| `/cluster/vcenter` | `/cluster/compute/vcenter/vms` |
| `/cluster/vcenter/dashboard` | `/cluster/compute/dashboard` |
| `/cluster/vcenter/hosts` | `/cluster/compute/vcenter/hosts` |
| `/cluster/vcenter/gpu` | `/cluster/compute/vcenter/gpu` |
| `/cluster/vcenter/settings` | `/cluster/compute/vcenter/settings` |
| `/cluster/vcenter/cloud` | `/cluster/compute/cloud` |
| `/cluster/vcenter/tools/ip-scan` | `/cluster/compute/tools/ip-scan` |

### 5.3 网络设备工作区

前端路径前缀：

```text
/cluster/network/*
```

二级导航：

| 菜单 | 路径 | 页面职责 |
| --- | --- | --- |
| 总览 | `/cluster/network/dashboard` | 汇总 iKuai/OpenWrt 数据源健康、WAN、LAN 客户端、异常 exporter |
| iKuai / 监控概览 | `/cluster/network/ikuai/dashboard` | 从现有 `VCenterIkuaiRouterPage` 迁出的主图表 |
| iKuai / 接口与 WAN | `/cluster/network/ikuai/interfaces` | WAN/LAN 接口、实时上下行、连接数 |
| iKuai / LAN 客户端 | `/cluster/network/ikuai/clients` | IP、MAC、主机名、备注、上下行、连接数 |
| iKuai / 协议流量 | `/cluster/network/ikuai/apps` | 应用分类/协议流量图 |
| iKuai / 与虚拟机对齐 | `/cluster/network/ikuai/vm-mapping` | 按 VM Guest IP 对齐 iKuai 客户端流量 |
| iKuai / 数据源状态 | `/cluster/network/ikuai/exporter` | 指标族探测、查询语句、缺失项提示 |
| OpenWrt / 监控概览 | `/cluster/network/openwrt/dashboard` | OpenWrt CPU、内存、负载、接口、在线状态 |
| OpenWrt / 接口与 WAN | `/cluster/network/openwrt/interfaces` | `node_network_*`、openwrt collector 接口指标 |
| OpenWrt / DHCP/邻居表 | `/cluster/network/openwrt/clients` | DHCP、ARP、邻居、客户端 IP/MAC 展示 |
| OpenWrt / 连接跟踪 | `/cluster/network/openwrt/connections` | conntrack/netstat 指标，有指标才展示详情 |
| OpenWrt / 无线 | `/cluster/network/openwrt/wireless` | wifi collector 指标存在时展示 SSID、station、信号 |
| OpenWrt / 数据源状态 | `/cluster/network/openwrt/exporter` | exporter 安装建议、缺失 collector 提示 |

旧路径兼容：

| 旧路径 | 新路径 |
| --- | --- |
| `/cluster/vcenter/router` | `/cluster/network/ikuai/dashboard` |

### 5.4 应用中心工作区

前端路径前缀继续使用：

```text
/cluster/apps/*
```

二级导航改为分组展示：

| 分组 | 菜单 | 路径 |
| --- | --- | --- |
| 总览 | Dashboard | `/cluster/apps/dashboard` |
| 基础组件 | Redis | `/cluster/apps/redis` |
| 基础组件 | Kafka | `/cluster/apps/kafka` |
| 基础组件 | OpenSearch | `/cluster/apps/opensearch` |
| 网络与域名 | DNS 管理 | `/cluster/apps/dns` |
| 网络与域名 | Cloud VM | `/cluster/apps/cloud-vm` |
| 智能体 | OpenClaw | `/cluster/apps/openclaw` |
| 智能体 | Hermes | `/cluster/apps/hermes` |

Hermes 子路由：

| 页面 | 路径 | 页面职责 |
| --- | --- | --- |
| 实例列表 | `/cluster/apps/hermes` | 实例、状态、公开地址、模型、最近探活 |
| 创建 Hermes | `/cluster/apps/hermes/create` | 命名空间、Deployment、模式、模型、Secret、PVC、暴露方式 |
| 首次引导 | `/cluster/apps/hermes/bootstrap` | 镜像模板、默认命名空间、默认模式、默认资源规格 |
| 实例详情 | `/cluster/apps/hermes/:id` | 状态、配置文件、Secret、日志、重启、探活、OpenClaw 迁移 |

## 6. 后端模块设计

### 6.1 PVE 模块

目录：

```text
api/api/pve/
  controller/pve.go
  service/routes.go
  service/targets.go
  service/client.go
  service/nodes.go
  service/guests.go
  service/storage.go
  service/tasks.go
  model/pve.go

api/router/pve/pve.go
```

路由注册：

```go
func RegisterRoutes(api *gin.RouterGroup, app *appctx.ServerApp) {
    controller.New(app).RegisterRoutes(api)
}
```

#### 6.1.1 PVE target 数据结构

存储键：

```text
kubebt_pve_targets_v1
```

JSON 结构：

```json
{
  "targets": [
    {
      "id": "uuid",
      "name": "homelab-pve",
      "baseUrl": "https://pve.example.local:8006",
      "tokenId": "root@pam!kubebt",
      "tokenSecretEnc": "encrypted-secret",
      "skipTls": true,
      "prometheusJob": "pve",
      "createdAt": "2026-05-20T18:00:00+08:00",
      "updatedAt": "2026-05-20T18:00:00+08:00"
    }
  ]
}
```

列表响应不返回 `tokenSecretEnc`，只返回：

```json
{
  "tokenSecretSet": true,
  "tokenSecretPreview": "abcd****wxyz"
}
```

#### 6.1.2 PVE API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/pve/targets` | viewer 可读 | 列出 PVE 目标 |
| `POST` | `/api/pve/targets` | admin | 新建 PVE 目标 |
| `PUT` | `/api/pve/targets/:id` | admin | 更新目标，密钥留空表示保留 |
| `DELETE` | `/api/pve/targets/:id` | admin | 删除目标 |
| `POST` | `/api/pve/targets/:id/probe` | admin | 调 `/version` 探活 |
| `GET` | `/api/pve/targets/:id/summary` | viewer 可读 | 聚合 nodes、guests、storage、tasks 摘要 |
| `GET` | `/api/pve/targets/:id/nodes` | viewer 可读 | 调 `/nodes` |
| `GET` | `/api/pve/targets/:id/guests` | viewer 可读 | 从 `/cluster/resources?type=vm` 或 nodes 下接口聚合 VM/LXC |
| `POST` | `/api/pve/targets/:id/guests/:vmid/power` | admin | start/stop/reboot/shutdown |
| `GET` | `/api/pve/targets/:id/storage` | viewer 可读 | storage 列表 |
| `GET` | `/api/pve/targets/:id/tasks` | viewer 可读 | 近期任务 |

#### 6.1.3 PVE client 规则

`baseUrl` 规范化：

- 用户输入 `10.0.0.5` 时转为 `https://10.0.0.5:8006`。
- 用户输入 `https://10.0.0.5:8006/api2/json` 时内部保存根地址 `https://10.0.0.5:8006`。
- 所有请求拼接 `/api2/json/<path>`。

Header：

```text
Authorization: PVEAPIToken=<tokenId>=<tokenSecret>
Accept: application/json
```

错误处理：

- `401/403`：返回“PVE Token 无效或权限不足”。
- TLS 错误且 `skipTls=false`：返回“证书校验失败，可在内网自签场景启用跳过 TLS”。
- JSON schema 不符合预期：返回“PVE 返回格式异常”，并记录后端日志。

### 6.2 Network 模块

目录：

```text
api/api/network/
  controller/network.go
  service/routes.go
  service/devices.go
  service/prometheus.go
  service/ikuai.go
  service/openwrt.go
  service/vm_mapping.go
  model/network.go

api/router/network/network.go
```

#### 6.2.1 网络设备存储

存储键：

```text
kubebt_network_devices_v1
```

JSON 结构：

```json
{
  "devices": [
    {
      "id": "uuid",
      "kind": "ikuai",
      "name": "主路由 iKuai",
      "prometheusScope": "vcenter",
      "instanceLabel": "10.0.0.1:9100",
      "jobLabel": "ikuai",
      "notes": "Go 版 ikuai_exporter",
      "createdAt": "2026-05-20T18:00:00+08:00",
      "updatedAt": "2026-05-20T18:00:00+08:00"
    },
    {
      "id": "uuid",
      "kind": "openwrt",
      "name": "旁路由 OpenWrt",
      "prometheusScope": "network",
      "instanceLabel": "10.0.0.2:9100",
      "jobLabel": "openwrt",
      "notes": "prometheus-node-exporter-lua-openwrt",
      "createdAt": "2026-05-20T18:00:00+08:00",
      "updatedAt": "2026-05-20T18:00:00+08:00"
    }
  ]
}
```

`prometheusScope` 允许：

- `network`：新增推荐 scope。
- `vcenter`：兼容现有 iKuai 使用 `prometheusUrlVcenter` 的部署。
- `default`：使用全局 `prometheusUrl`。

#### 6.2.2 Network API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/network/devices` | viewer 可读 | 列出网络设备 |
| `POST` | `/api/network/devices` | admin | 新建设备登记 |
| `PUT` | `/api/network/devices/:id` | admin | 更新设备登记 |
| `DELETE` | `/api/network/devices/:id` | admin | 删除设备登记 |
| `GET` | `/api/network/devices/discover` | viewer 可读 | 从 Prometheus 自动发现 iKuai/OpenWrt instance |
| `GET` | `/api/network/devices/:id/overview` | viewer 可读 | 系统概览 |
| `GET` | `/api/network/devices/:id/interfaces` | viewer 可读 | 接口与 WAN/LAN 流量 |
| `GET` | `/api/network/devices/:id/clients` | viewer 可读 | LAN/DHCP/邻居客户端 |
| `GET` | `/api/network/devices/:id/traffic` | viewer 可读 | 协议/应用/Top IP 流量 |
| `GET` | `/api/network/devices/:id/exporter-status` | viewer 可读 | 指标族探测状态 |
| `GET` | `/api/network/vm-mapping` | viewer 可读 | 复用 vCenter VM Guest IP 与网络客户端流量对齐 |

旧 API：

```text
GET /api/vcenter/vms/ikuai-client-stream
```

继续保留，内部调用 network service，返回字段保持兼容。

#### 6.2.3 iKuai 指标族

当前已支持：

- Go 版：
  - `ikuai_up`
  - `ikuai_device_count`
  - `ikuai_cpu_usage_ratio`
  - `ikuai_memory_usage_bytes`
  - `ikuai_memory_size_bytes`
  - `ikuai_network_recv_kbytes_per_second`
  - `ikuai_network_send_kbytes_per_second`
  - `ikuai_device_info`
  - `ikuai_app_flow_histogram_sum`
- Python 版：
  - `ikuai_sys_stat_cpu_used`
  - `ikuai_sys_stat_memory`
  - `ikuai_sys_stat_stream`
  - `ikuai_client_download`
  - `ikuai_client_upload`
  - `ikuai_client_connect_num`
  - `ikuai_protocol_appflow`

Network 模块保持这些 PromQL 兼容，但将函数名从 `vcenter_ikuai_*` 迁到 `network_ikuai_*`。

#### 6.2.4 OpenWrt 指标族

OpenWrt 采用“探测后展示”：

- 基础系统：
  - `node_load1`
  - `node_memory_MemTotal_bytes`
  - `node_memory_MemAvailable_bytes`
  - `node_filesystem_size_bytes`
  - `node_filesystem_avail_bytes`
  - `node_time_seconds`
- 接口：
  - `node_network_receive_bytes_total`
  - `node_network_transmit_bytes_total`
  - `node_network_up`
- OpenWrt collector：
  - `node_openwrt_info`
  - `node_openwrt_dhcp_leases`
  - `node_openwrt_wifi_station_signal_dbm`
  - `node_netstat_Tcp_CurrEstab`

不同版本 exporter 的指标名可能不同，后端需要返回：

```json
{
  "families": {
    "system": true,
    "interfaces": true,
    "dhcp": false,
    "wifi": true,
    "conntrack": false
  },
  "missingHints": [
    "未发现 DHCP 指标，可安装或启用 prometheus-node-exporter-lua-openwrt",
    "未发现 netstat 指标，可安装 prometheus-node-exporter-lua-netstat"
  ]
}
```

### 6.3 Hermes 模块

目录：

```text
api/api/appcenter/service/
  hermes_bootstrap.go
  hermes_store.go
  hermes_handlers.go
  hermes_k8s.go
  hermes_status.go
  hermes_files.go
  hermes_secret.go
  hermes_probe.go
  hermes_migration.go
```

#### 6.3.1 Hermes bootstrap 存储

存储键：

```text
appcenter_hermes_bootstrap_v1
```

JSON 结构：

```json
{
  "bootstrapComplete": true,
  "defaultNamespace": "hermes",
  "defaultMode": "gateway-dashboard",
  "defaultImage": "ghcr.io/nousresearch/hermes-agent:latest",
  "defaultStorageSize": "10Gi",
  "defaultModelProvider": "openrouter",
  "defaultModelName": "anthropic/claude-sonnet-4.5",
  "modes": [
    {
      "id": "gateway",
      "label": "Gateway",
      "description": "运行 hermes gateway run，适合 Telegram/Discord/Slack 等消息入口",
      "command": ["gateway", "run"]
    },
    {
      "id": "dashboard",
      "label": "Dashboard",
      "description": "运行 hermes dashboard，适合浏览器访问",
      "command": ["dashboard", "--host", "0.0.0.0", "--no-open"]
    },
    {
      "id": "gateway-dashboard",
      "label": "Gateway + Dashboard",
      "description": "同时运行 gateway 与 dashboard，由平台生成两个容器或两个 Deployment"
    }
  ]
}
```

#### 6.3.2 Hermes instance 存储

存储键：

```text
kubebt_app_hermes_instances_v1
```

JSON 结构：

```json
{
  "instances": [
    {
      "id": "uuid",
      "displayName": "Hermes Agent",
      "namespace": "hermes",
      "deploymentName": "hermes-agent",
      "serviceName": "hermes-agent",
      "image": "ghcr.io/nousresearch/hermes-agent:latest",
      "mode": "gateway-dashboard",
      "modelProvider": "openrouter",
      "modelName": "anthropic/claude-sonnet-4.5",
      "homePvcName": "hermes-agent-home",
      "secretName": "hermes-agent-secrets",
      "configMapName": "hermes-agent-config",
      "exposeMode": "ingress",
      "ingressHost": "hermes.example.com",
      "publicUrl": "https://hermes.example.com",
      "createdAt": "2026-05-20T18:00:00+08:00",
      "updatedAt": "2026-05-20T18:00:00+08:00"
    }
  ]
}
```

#### 6.3.3 Hermes API

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/app-center/hermes/bootstrap` | viewer 可读 | Bootstrap 配置 |
| `PUT` | `/api/app-center/hermes/bootstrap` | admin | 保存 Bootstrap |
| `GET` | `/api/app-center/hermes/instances` | viewer 可读 | 实例列表 |
| `POST` | `/api/app-center/hermes/k8s-deploy` | admin | 部署 Hermes |
| `GET` | `/api/app-center/hermes/instances/k8s-status` | viewer 可读 | 批量 K8s 状态 |
| `GET` | `/api/app-center/hermes/instances/:id` | viewer 可读 | 实例详情 |
| `GET` | `/api/app-center/hermes/instances/:id/file` | admin | 读取配置文件 |
| `PUT` | `/api/app-center/hermes/instances/:id/file` | admin | 写入配置文件 |
| `POST` | `/api/app-center/hermes/instances/:id/probe` | viewer 可读 | 探测 dashboard/API server/gateway 健康 |
| `POST` | `/api/app-center/hermes/instances/:id/restart` | admin | 滚动重启 |
| `POST` | `/api/app-center/hermes/instances/:id/migrate-openclaw-dry-run` | admin | OpenClaw 迁移预览 |
| `POST` | `/api/app-center/hermes/instances/:id/migrate-openclaw` | admin | 执行 OpenClaw 迁移 |
| `DELETE` | `/api/app-center/hermes/instances/:id` | admin | 删除实例与专属资源 |

#### 6.3.4 Hermes K8s 部署约定

容器环境变量：

```text
HERMES_HOME=/opt/data
```

PVC 挂载：

```text
/opt/data
```

Secret 字段：

- `OPENROUTER_API_KEY`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `KIMI_API_KEY`
- `MINIMAX_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `DISCORD_TOKEN`
- `API_SERVER_KEY`

列表页只展示：

- `openrouterApiKeySet`
- `telegramBotTokenSet`
- `apiServerKeySet`

不返回明文。

Gateway 模式 command：

```json
["gateway", "run"]
```

Dashboard 模式 command：

```json
["dashboard", "--host", "0.0.0.0", "--no-open"]
```

`gateway-dashboard` 模式第一版使用一个 Deployment 两个容器，分别运行 gateway 和 dashboard，共享同一个 PVC 与 Secret。这样比在一个容器里写 shell supervisor 更符合 Kubernetes 语义。

#### 6.3.5 OpenClaw 迁移

Hermes 官方支持：

```bash
hermes claw migrate
hermes claw migrate --dry-run
hermes claw migrate --preset user-data
hermes claw migrate --overwrite
```

平台第一版提供：

- `dry-run`：在 Hermes Pod 内执行 `hermes claw migrate --dry-run`，返回 stdout/stderr。
- `execute`：执行 `hermes claw migrate --preset user-data`，默认不迁移 Secret。若用户勾选“迁移允许的密钥”，才执行 full preset。

平台不自动读取其他 OpenClaw PVC 中的敏感文件。用户需要明确选择源 OpenClaw 实例，后端通过 K8s Job 或临时挂载将源 PVC 只读挂入迁移任务。

## 7. 前端设计

### 7.1 Compute 前端

新增：

```text
web/src/app/routes/compute-routes.tsx
web/src/features/compute/layout/ComputeLayout.tsx
web/src/features/compute/layout/ComputeSubNav.tsx
web/src/features/compute/pages/ComputeDashboard.tsx
web/src/features/compute/pve/pages/PveDashboard.tsx
web/src/features/compute/pve/pages/PveTargets.tsx
web/src/features/compute/pve/pages/PveGuests.tsx
web/src/features/compute/pve/pages/PveNodes.tsx
web/src/features/compute/pve/pages/PveStorage.tsx
web/src/features/compute/pve/pages/PveTasks.tsx
```

复用：

- `web/src/features/vcenter/pages/VCenterList.tsx`
- `web/src/features/vcenter/pages/VCenterHosts.tsx`
- `web/src/features/vcenter/pages/VCenterGpuDashboard.tsx`
- `web/src/features/vcenter/pages/VCenterSettings.tsx`
- `web/src/features/vcenter/pages/CloudHosts.tsx`

第一阶段不物理移动这些 vCenter 文件，只在路由层挂载到新路径。

### 7.2 Network 前端

新增：

```text
web/src/app/routes/network-routes.tsx
web/src/features/network/layout/NetworkLayout.tsx
web/src/features/network/layout/NetworkSubNav.tsx
web/src/features/network/pages/NetworkDashboard.tsx
web/src/features/network/ikuai/pages/IkuaiDashboard.tsx
web/src/features/network/ikuai/pages/IkuaiClients.tsx
web/src/features/network/ikuai/pages/IkuaiInterfaces.tsx
web/src/features/network/ikuai/pages/IkuaiVmMapping.tsx
web/src/features/network/openwrt/pages/OpenWrtDashboard.tsx
web/src/features/network/openwrt/pages/OpenWrtClients.tsx
web/src/features/network/openwrt/pages/OpenWrtInterfaces.tsx
web/src/features/network/openwrt/pages/OpenWrtConnections.tsx
web/src/features/network/openwrt/pages/OpenWrtWireless.tsx
```

迁移：

- `VCenterIkuaiRouterPage.tsx` 的核心逻辑迁到 `features/network/ikuai`。
- 原页面保留薄 redirect 或 wrapper，确保旧 import 不立即失效。

Network 页面不写说明型落地页，进入后直接是可操作/可读的工作台。

### 7.3 Hermes 前端

新增：

```text
web/src/features/app-center/hermes/pages/AppCenterHermes.tsx
web/src/features/app-center/hermes/pages/AppCenterHermesBootstrap.tsx
web/src/features/app-center/hermes/pages/AppCenterHermesCreate.tsx
web/src/features/app-center/hermes/pages/AppCenterHermesDetail.tsx
web/src/features/app-center/hermes/components/HermesStatusBanner.tsx
web/src/features/app-center/hermes/components/HermesConfigEditor.tsx
web/src/features/app-center/hermes/components/HermesSecretPanel.tsx
web/src/features/app-center/hermes/components/HermesMigrationPanel.tsx
```

App Center 导航新增 Hermes，并按分组展示。Dashboard 统计新增 `Hermes 实例` 卡片。

Hermes 详情页 tabs：

- `状态`
- `配置`
- `密钥`
- `日志`
- `迁移`
- `危险操作`

## 8. 权限、安全与审计

### 8.1 权限

viewer：

- 可查看 PVE、Network、Hermes 列表与状态。
- 不可查看 Secret 明文。
- 不可执行 PVE power 操作。
- 不可修改 Hermes 配置或重启。

admin：

- 可新增/更新/删除 PVE targets。
- 可执行 PVE power 操作。
- 可新增/更新/删除网络设备登记。
- 可部署/更新/删除 Hermes。
- 可读写 Hermes 配置文件。
- 可执行 Hermes migration。

### 8.2 Secret

所有密钥遵循现有 OpenClaw/CloudVM 模式：

- 明文只允许在请求体出现。
- 后端写入 K8s Secret 或平台加密存储。
- 列表响应仅返回 `xxxSet` 与 masked preview。
- 删除实例时删除本实例专属 Secret。

### 8.3 审计

以下动作写审计日志：

- PVE target create/update/delete。
- PVE power action。
- Network device create/update/delete。
- Hermes bootstrap update。
- Hermes deploy/update/delete/restart。
- Hermes file write。
- Hermes migration execute。

审计内容不包含密钥明文。

## 9. 兼容策略

### 9.1 旧前端路径

旧路径通过 React Router redirect 保留至少一个大版本：

```text
/cluster/vcenter -> /cluster/compute/vcenter/vms
/cluster/vcenter/dashboard -> /cluster/compute/dashboard
/cluster/vcenter/router -> /cluster/network/ikuai/dashboard
/cluster/vcenter/cloud -> /cluster/compute/cloud
```

### 9.2 旧后端 API

保留：

```text
GET /api/vcenter/vms/ikuai-client-stream
```

内部调用：

```text
network service -> iKuai client stream
```

响应字段保持现状，避免 `VCenterList.tsx` 的旧逻辑在迁移中断。

### 9.3 Prometheus scope

现有配置只有：

- `prometheusUrl`
- `prometheusUrlK8s`
- `prometheusUrlVcenter`
- `prometheusUrlCloud`

本次新增 `prometheusUrlNetwork` 与 `vmSelectUrlNetwork` 是理想形态，但第一步可以不强依赖。Network 模块的 scope 解析顺序：

1. `network`：若新增配置存在则用 `prometheusUrlNetwork`。
2. `vcenter`：兼容现有 iKuai。
3. `default`：使用 `prometheusUrl`。

如果第一批实施不新增运行时配置字段，则 Network 页面先允许设备选择 `vcenter` 或 `default` scope。

## 10. 实施顺序

### 10.1 第一阶段：信息架构与路由兼容

目标：

- 新增 `compute` 与 `network` 工作区。
- 将 iKuai 页面迁入 `network`。
- 保持旧 vCenter 路由跳转。

主要文件：

- `web/src/app/routes/compute-routes.tsx`
- `web/src/app/routes/network-routes.tsx`
- `web/src/app/route-inventory.ts`
- `web/src/app/routes/vcenter-routes.tsx`
- `web/src/shared/layout/Sidebar.tsx`
- `web/src/features/network/**`
- `web/src/features/compute/**`

验证：

- `/cluster/compute/dashboard` 可访问。
- `/cluster/network/ikuai/dashboard` 可访问。
- `/cluster/vcenter/router` 自动跳转。
- `npm run build` 通过。

### 10.2 第二阶段：Network 后端抽取与 OpenWrt

目标：

- 新增 `api/api/network` 与 `api/router/network`。
- iKuai Prometheus 查询从 vCenter 旧文件抽到 network service。
- 新增 OpenWrt 指标探测与 API。
- 保留旧 `/api/vcenter/vms/ikuai-client-stream`。

主要文件：

- `api/router/router.go`
- `api/router/network/network.go`
- `api/api/network/**`
- `api/common/core/vcenter_ikuai_prometheus.go`
- `api/common/core/vcenter_handlers.go`

验证：

- `go test ./api/network/... ./common/core -run TestNetwork -count=1`
- 旧 iKuai API 响应字段不变。
- OpenWrt exporter-status 在无指标时返回明确 missing hints。

### 10.3 第三阶段：PVE 后端与前端

目标：

- 新增 PVE target 存储与 client。
- 新增 nodes、guests、storage、tasks、power API。
- 新增 PVE 页面。

主要文件：

- `api/router/pve/pve.go`
- `api/api/pve/**`
- `web/src/features/compute/pve/**`
- `web/src/app/routes/compute-routes.tsx`

验证：

- PVE URL normalize 单测。
- PVE Authorization header 单测。
- PVE target secret masking 单测。
- 前端 build 通过。

### 10.4 第四阶段：Hermes 后端与前端

目标：

- 新增 Hermes bootstrap、store、K8s deploy、status、file、secret、probe、migration。
- 新增 Hermes App Center 页面。
- AppCenter dashboard 和导航展示 Hermes。

主要文件：

- `api/api/appcenter/service/hermes_*.go`
- `api/api/appcenter/controller/appcenter.go`
- `web/src/app/routes/app-center-routes.tsx`
- `web/src/features/app-center/layout/AppCenterSubNav.tsx`
- `web/src/features/app-center/layout/AppCenterDashboard.tsx`
- `web/src/features/app-center/hermes/**`

验证：

- Hermes manifest 生成单测。
- Secret masking 单测。
- status batch 在 K8s 未连接时返回可读错误。
- migration dry-run 命令构造单测。

### 10.5 第五阶段：文档、权限、全量验证

目标：

- 更新 README 与 AGENT 中工作区描述。
- 补权限映射。
- 补路由/菜单测试说明。

验证：

- `go test ./...`
- `cd web && npm run build`
- `cd web && npm run lint`

## 11. 测试策略

### 11.1 Go 单测

PVE：

- `normalizePVEBaseURL("10.0.0.5") == "https://10.0.0.5:8006"`
- `normalizePVEBaseURL("https://10.0.0.5:8006/api2/json") == "https://10.0.0.5:8006"`
- Authorization header 正确。
- Token secret 空字符串更新时保留旧值。
- Power action 仅允许 `start | stop | shutdown | reboot | reset`。

Network：

- iKuai Go 版 PromQL 与现有查询一致。
- iKuai Python 版 fallback 查询一致。
- OpenWrt exporter family probe 能识别系统、接口、DHCP、wifi、netstat 缺失。
- 旧 `/api/vcenter/vms/ikuai-client-stream` wrapper 返回旧字段。

Hermes：

- `gateway` 模式生成一个 Deployment 一个容器。
- `dashboard` 模式 command 为 `["dashboard","--host","0.0.0.0","--no-open"]`。
- `gateway-dashboard` 模式生成两个容器并共享 PVC。
- Secret 列表响应只返回 `xxxSet`。
- migration dry-run 命令为 `hermes claw migrate --dry-run`。

### 11.2 前端验证

- 旧路由跳转正确。
- 侧栏 active 状态正确。
- Compute dashboard 在 vCenter 未配置、PVE 未配置时显示空态。
- Network dashboard 在 Prometheus 未配置时显示数据源提示，不崩溃。
- Hermes bootstrap 未完成时列表页引导管理员进入配置页。
- viewer 角色隐藏写按钮。

### 11.3 手工联调

- 使用无效 PVE Token，确认 probe 返回权限错误。
- 使用自签 PVE，确认 `skipTls=false` 报证书错误，`skipTls=true` 可探活。
- 使用现有 iKuai Prometheus，确认新旧页面数据一致。
- 使用没有 OpenWrt wifi collector 的设备，确认无线页显示“未发现指标”而不是空白图。
- 部署 Hermes gateway-dashboard，确认两个容器均 Ready，PVC 已挂载到 `/opt/data`。

## 12. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| vCenter 旧代码仍在 `common/core`，一次性迁移风险高 | 本次只新增 compute 路由兼容，不强制物理迁移所有 vCenter 文件 |
| iKuai 从 vCenter 迁到 Network 可能影响现有页面 | 保留旧前端路径与旧后端 API，内部转发 |
| OpenWrt 指标名随 exporter 版本变化 | 使用 family probe + missing hints，不假设所有指标存在 |
| PVE 写操作权限过大 | 推荐用户创建最小权限 API Token；平台只在 admin 下暴露写操作 |
| Hermes 依赖镜像与运行参数变化 | Bootstrap 中暴露镜像与命令模板；默认模式保持可编辑 |
| Hermes Secret 泄露 | 列表永不返回明文；配置页保存后清空输入；审计不记录 Secret |
| 一次性改动过大导致回归 | 按五阶段实施，每阶段都有旧路径兼容与验证命令 |

## 13. 最终验收标准

1. 主侧栏存在 `虚拟化与主机` 与 `网络设备` 工作区。
2. `/cluster/network/ikuai/dashboard` 能显示原 iKuai 监控能力。
3. `/cluster/vcenter/router` 能跳转到新 iKuai 页面。
4. PVE 可以新增 target、探活、查看 nodes/guests/storage/tasks，并执行 VM/LXC power 操作。
5. OpenWrt 可以登记 Prometheus instance，并展示系统、接口、客户端、连接、无线的只读状态；缺失指标有明确提示。
6. 应用中心存在 Hermes 菜单与 Dashboard 统计。
7. Hermes 可以完成 bootstrap、部署实例、查看 K8s 状态、探活、读取/写入配置、重启、执行 OpenClaw 迁移 dry-run。
8. viewer 角色不能执行任何写操作或查看密钥明文。
9. `go test ./...`、`web` 构建通过。

