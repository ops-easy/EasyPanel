# AI 巡检 Provider 化改造执行计划

## 目标

将 AI 巡检从“只面向 OpenClaw”彻底改为“面向 AI Provider”。Provider 支持 `custom`、`openclaw`、`hermes`，来源支持手工配置与应用中心实例。旧的 `/api/ops/openclaw` 巡检配置入口与旧 KV 不再作为兼容入口保留。

## 关键设计

1. 配置模型统一为 `OpsAIProviderBundle`。
   - 主端点：`endpoint`
   - 分场景覆盖：`providerProfiles`
   - 巡检开关与调度：`ai`

2. KV 只写新键。
   - 新键：`kubebt_ops_ai_provider_v1`
   - 旧键：`kubebt_ops_openclaw_v1` 不再读取、写入或迁移

3. API 只保留新入口。
   - `GET /api/ops/ai-provider`
   - `PUT /api/ops/ai-provider`
   - `POST /api/ops/vmlog/ai-analyze`
   - `POST /api/ops/vmlog/ai-analyze-row`

4. Provider 解析策略。
   - `custom`：直接使用页面填写的 OpenAI-compatible `baseUrl`、`apiKey`、`model`
   - `openclaw + appCenter`：从应用中心 OpenClaw 实例解析集群内 `/v1` 地址、网关 token、模型映射
   - `hermes + appCenter`：从应用中心 Hermes 实例解析 gateway Service 地址、`API_SERVER_KEY`、默认模型

5. 分场景能力统一走 provider。
   - `inspect_summary`
   - `inspect_probe`
   - `vmlog_analyze`
   - `cluster_advisory`

## 后端实施步骤

1. 新建 AI Provider store 与测试。
   - 定义 `OpsAIProviderEndpoint`、`OpsAIProviderBundle`
   - 增加默认值、归一化、读写新 KV
   - 增加单测确认默认值、分场景覆盖、Hermes gateway URL、不会写旧 KV

2. 替换巡检配置 API。
   - 删除巡检配置里的 OpenClaw 命名入口
   - 返回 `endpoint/providerProfiles/ai`
   - 保存时按 provider/source 解析应用中心实例

3. 替换巡检执行链路。
   - `RunPlatformInspection` 接收 `OpsAIProviderBundle`
   - AI 摘要、模型探针、日志分析、控制面建议全部使用 `opsAIProviderChatAPI`
   - OpenClaw 仅作为 provider 的一种实现保留 direct upstream 优化

4. 接入 Hermes。
   - 读取应用中心 Hermes 实例 KV
   - 检查 `gateway` 或 `gateway-dashboard` 模式
   - 生成 `http://{service}.{namespace}.svc.cluster.local:8642/v1`
   - 从 Kubernetes Secret 读取 `API_SERVER_KEY`

5. 保留应用中心 OpenClaw 自身能力。
   - OpenClaw 安装、配置文件、代理、实例管理继续存在
   - “同步到巡检”改为写入新 AI Provider 配置

## 前端实施步骤

1. AI 巡检配置页改为 AI Provider 配置。
   - Provider 可选 `Custom / OpenAI compatible`、`OpenClaw`、`Hermes`
   - 来源可选 `custom` 或 `appCenter`
   - 应用中心来源按 provider 展示 OpenClaw 或 Hermes 实例

2. API 调用全部改到新入口。
   - 配置页、Dashboard、首页总览读取 `/api/ops/ai-provider`
   - 日志分析调用 `/api/ops/vmlog/ai-analyze`
   - 单行日志分析调用 `/api/ops/vmlog/ai-analyze-row`

3. 类型与测试同步。
   - `OpenClawGet` 改为 `AIProviderGet`
   - `openclawProfiles` 改为 `providerProfiles`
   - 增加前端 node test，防止旧巡检入口回流

## 验证清单

1. `go test ./common/core -run "Test.*AIProvider|TestHermesGatewayBaseURL" -count=1`
2. `go test ./api/appcenter/service -run TestHermes -count=1`
3. `node web/tests/ai-inspect-provider-rewrite.test.mjs`
4. `npm run build`
5. `rg` 扫描确认旧巡检 API 路径不再存在

## 已知非本次问题

宽范围 `go test ./common/core ./api/appcenter/service -count=1` 中，`common/core` 仍会因仓库根配置文件缺失失败：`open ..\..\config.yaml: The system cannot find the file specified.` 这是本次改造前已存在的 baseline 问题，不属于 AI Provider 改造引入。
