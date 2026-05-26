# AGENT.md

本文档提供给参与本仓库工作的编码代理和自动化助手。所有说明均以当前仓库结构为准。

## 沟通与计划

- 全局首选中文：执行计划、任务拆解、进度更新、提问、总结和交付说明默认使用中文。
- 仅在用户明确要求、引用原始接口/命令/错误信息，或技术名词必须保留原文时使用英文。

## 编码与文档

- 文本文件统一按 UTF-8 读取和写入。
- 项目文档必须使用中文，避免出现乱码、机翻残留或半截英文模板。
- 新增或修改代码注释、配置注释和文档说明时必须使用中文；必要的技术名词、协议名、配置键名和代码符号可保留原文。
- 如果发现已有中文文本损坏，应在改动相关区域时顺手修复；大范围修复需保持改动目的清晰。
- 不要把密钥、Token、Cookie、私钥、真实生产密码写入文档、测试或示例清单。

## Git 提交规范

- 所有提交信息必须使用中文，清楚说明本次改动内容。
- 提交信息应简洁直接，例如 `更新中文部署文档`、`修复宝塔同步配置校验`。
- 不要使用英文模板式提交信息，例如 `initial import`、`update docs`、`fix bug`。

## 项目背景

EasyPanel 是一个自建基础设施运维控制台，主要服务以下场景：

- Kubernetes 集群资源查看、编辑和诊断。
- 将带注解的 Ingress 同步到宝塔 Nginx。
- Redis、Kafka、OpenSearch、Cloud VM、OpenClaw 等应用的部署与管理。
- vCenter 虚拟机、ESXi 主机、WebMKS 控制台、SSH/SFTP 和堡垒机能力。
- Prometheus、VictoriaMetrics、VictoriaLogs、Harbor、企业微信告警和巡检报告。
- Markdown 文档中心、附件、公开分享页和 Excalidraw 白板。

## 目录结构

```text
api/                         Go 后端
web/                         React + TypeScript + Vite 前端
k8s/backend/                 后端 Kubernetes 清单
k8s/frontend/                前端 Kubernetes 清单
k8s/charts/kube-bt-sync/     Helm Chart
docs/                        运维文档
.github/workflows/           镜像发布工作流
```

## 常用命令

```bash
# 后端
cd api && go run .
cd api && go test ./...
cd api && go build -o kube-bt-sync .

# 前端
cd web && npm ci
cd web && npm run dev
cd web && npm run build
cd web && npm run lint

# 一键入口
make start-backend
make start-frontend

# Kubernetes
kubectl apply -k k8s
helm install kube-bt-sync ./k8s/charts/kube-bt-sync --namespace easy --create-namespace
```

## 架构要点

后端入口为 `api/main.go`，核心代码位于 `api/internal/`。`ServerApp` 负责持有运行时配置、Kubernetes client、MySQL、Redis、vCenter、SSH 凭据存储等共享状态。静态配置来自环境变量和 `api/config.yaml`，页面保存的动态配置写入 MySQL 的 `kubebt_platform_kv`，不再读取 `runtime-config.json` 或 PVC 上的动态覆盖文件。

前端入口为 `web/src/main.tsx` 与 `web/src/App.tsx`。路由覆盖工作台、集群、宝塔、应用中心、AI 巡检、vCenter、堡垒机、文档中心、账号设置等页面。前端通过 `/api/` 调用后端，通过 WebSocket 提供终端、日志和实时交互能力。

容器发布分为后端镜像和前端镜像：

- 后端镜像：`ghcr.io/ops-easy/kube-bt-sync`
- 前端镜像：`ghcr.io/ops-easy/kube-bt-sync-web`

推送到 `main` 后 GitHub Actions 会发布 `latest` 和 commit SHA 标签。

## Ingress 到宝塔同步

后台同步只有在 `INGRESS_BAOTA_SYNC_ENABLED=true` 后才会运行。受管 Ingress 使用以下注解：

| 注解 | 说明 |
| --- | --- |
| `kube-bt-sync.io/baota-sync: "true"` | 启用同步 |
| `kube-bt-sync.io/baota-https: "true"` | 在宝塔侧启用 HTTPS |
| `kube-bt-sync.io/baota-ssl-cert-name: "<cert>"` | 指定宝塔证书 |
| `kube-bt-sync.io/ddns-port: "<port>"` | 覆盖默认上游端口 |
| `i4t.com/baota-sync: "true"` | 旧版兼容注解 |

改动相关代码时需要同时关注：

- `api/internal/syncer.go`
- `api/internal/baota*.go`
- `api/internal/annotations.go`
- `api/internal/k8s_*`
- 前端宝塔与 Ingress 页面

## 安全注意事项

- 默认 RBAC 权限较高，生产部署时可按需要裁剪。
- 多副本部署时只允许一个副本启用后台任务。
- `DASHBOARD_SESSION_SECRET` 与 `KUBEBT_ENCRYPTION_KEY` 多副本必须固定。
- MySQL 动态配置、SSH 凭据、宝塔 API Key、vCenter 密码等都属于敏感数据。
- Web SSH、Pod Exec、SFTP 和 YAML 编辑相关功能应重点关注权限与审计。

## 变更建议

- 遵循现有代码风格，不做无关重构。
- Go 代码提交前运行 `gofmt` 和相关测试。
- 前端页面保持现有工作台风格，优先使用已有组件和工具函数。
- 文档改动要与当前目录和命令一致。
- 新增环境变量时同步更新 README、部署清单或 Helm values 示例。
