# Kubernetes 部署说明

本目录提供 EasyPanel 的 Kubernetes 原生清单和 Helm Chart。

## 目录结构

```text
k8s/
├── backend/                    # 后端 Namespace、RBAC、PVC、Secret 示例、Deployment、Service
├── frontend/                   # 前端 Nginx Deployment、NodePort Service、可选 Ingress
├── charts/easypanel/             # 单 Chart 部署入口
└── kustomization.yaml          # Kustomize 聚合入口
```

后端 Service 名称为 `easypanel-backend`，监听 `8080`。前端 Nginx Service 名称为 `easypanel-frontend`，默认使用 NodePort `32080`，并把 `/api/`、`/r/` 与公开媒体 `/d/` 代理到后端。

## 使用 Kustomize 部署

```bash
kubectl apply -k k8s
kubectl -n easy get pod,svc,pvc
```

访问：

```text
http://<任意节点 IP>:32080/setup
```

首次访问 `/setup` 后完成初始化，包括管理员账号、Kubernetes 连接方式、宝塔、MySQL、Redis、vCenter 等运行时配置。

如需通过 Ingress 暴露前端：

```bash
kubectl apply -f k8s/frontend/ingress.yaml
```

部署前请根据环境修改：

- `k8s/backend/deployment.yaml` 中的后端镜像地址。
- `k8s/frontend/frontend-deployment.yaml` 中的前端镜像地址。
- `k8s/frontend/ingress.yaml` 中的域名、TLS Secret 和 IngressClass。
- `k8s/backend/secret-example.yaml` 中的敏感配置示例。

## 使用 Helm 部署

```bash
helm install easypanel ./k8s/charts/easypanel \
  --namespace easy \
  --create-namespace \
  --set backend.image.repository=ghcr.io/ops-easy/easypanel-api \
  --set backend.image.tag=latest \
  --set frontend.image.repository=ghcr.io/ops-easy/easypanel-web \
  --set frontend.image.tag=latest
```

常用参数位于 `k8s/charts/easypanel/values.yaml`：

| 参数 | 说明 |
| --- | --- |
| `backend.replicaCount` | 后端副本数 |
| `backend.image.repository` | 后端镜像仓库 |
| `backend.env` | 后端普通环境变量 |
| `backend.extraEnvFrom` | Secret / ConfigMap 注入 |
| `frontend.service.type` | 前端 Service 类型 |
| `frontend.service.nodePort` | NodePort 端口，默认 `32080` |
| `ingress.enabled` | 是否创建 Ingress |
| `persistence.enabled` | 是否创建 PVC |
| `rbac.full` | 是否授予完整控制台权限 |

## 多副本部署

多副本可以提高 Web 请求可用性，但后台任务必须避免重复执行。

建议：

- 多个后端副本共享同一个 MySQL、Redis 和持久卷。
- 固定 `DASHBOARD_SESSION_SECRET`。
- 固定 `EASYPANEL_ENCRYPTION_KEY`。
- 仅一个后端副本设置 `EASYPANEL_ENABLE_BACKGROUND_JOBS=true`。
- 其他副本设置 `EASYPANEL_ENABLE_BACKGROUND_JOBS=false`。

后台任务包括：

- Ingress 到宝塔同步
- 巡检任务
- 告警评估
- 出站通知
- 部分审计和缓存维护任务

## 安全建议

- 敏感配置使用 Kubernetes `Secret` 注入。
- 生产环境通过 Ingress + HTTPS 暴露前端。
- HTTPS 下设置 `DASHBOARD_COOKIE_SECURE=true`。
- 按实际网络设置 `DASHBOARD_TRUSTED_PROXIES`。
- 默认 RBAC 权限较宽，生产环境可以根据功能裁剪。
- 不要把 `/setup` 长期暴露给公网。

## 部署验证

前端镜像内置 Nginx 需要同时代理 `/api/`、Kubernetes 反向代理 `/r/` 和公开媒体 `/d/`。发布前建议先在本地验证构建产物，再对预发地址执行烟测：

```bash
cd frontend
npm run build
npm run smoke:dist
SMOKE_BASE_URL=https://your-staging.example.com npm run smoke:deploy
SMOKE_BASE_URL=https://your-staging.example.com SMOKE_D_PATH=/d/ npm run smoke:deploy
```

也可以在 GitHub Actions 手动触发 `.github/workflows/frontend-remote-smoke.yml`，输入部署后的 `base-url`；如果目标环境需要登录，在仓库 Secrets 配置 `SMOKE_AUTH_COOKIE` 或 `SMOKE_BEARER_TOKEN`。

## 常用命令

```bash
# 查看资源
kubectl -n easy get all,pvc

# 查看后端日志
kubectl -n easy logs deploy/easypanel-backend -f

# 查看前端日志
kubectl -n easy logs deploy/easypanel-frontend -f

# 进入后端 Pod
kubectl -n easy exec -it deploy/easypanel-backend -- /busybox/sh

# 删除 Kustomize 部署
kubectl delete -k k8s

# 删除 Helm 部署
helm uninstall easypanel -n easy
```

后端最终镜像基于 distroless，通常不包含 shell；如需调试，请使用临时调试容器或 Kubernetes 原生排障方式。
