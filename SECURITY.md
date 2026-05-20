# 安全策略

Kube-BT-Sync 会连接 Kubernetes、宝塔面板、vCenter、MySQL、Redis、Harbor、Prometheus、VictoriaLogs、COS 等系统，部署时必须把它视为高权限运维组件。

## 支持范围

| 版本 | 安全支持 |
| --- | --- |
| `main` / `latest` | 支持 |
| 历史分支或旧标签 | 仅在维护者明确声明时支持 |

## 报告漏洞

请不要在公开 Issue 中披露安全漏洞、凭据泄露或可利用细节。

推荐方式：

1. 使用 GitHub Security Advisory 私有报告入口。
2. 如果项目维护者公开了安全邮箱，请通过邮件私下联系。

报告中请尽量包含：

- 漏洞类型，例如权限绕过、信息泄露、注入、SSRF、凭据暴露等
- 受影响的模块、接口或文件
- 复现步骤或最小 PoC
- 影响范围评估
- 可选的修复建议

维护者收到报告后，会尽快确认、评估影响、准备修复，并在修复发布前与报告者共同保持细节保密。

## 部署安全建议

### 敏感配置

不要把密码、API Key、私钥、Token 写入镜像、公开仓库或 ConfigMap。推荐使用：

- Kubernetes `Secret`
- CI/CD Secret
- 外部密钥管理系统
- 只读挂载的密钥文件

重点保护：

- `BAOTA_API_KEY`
- `VCENTER_PASSWORD`
- `MYSQL_DSN` / `MYSQL_PASSWORD`
- `REDIS_PASSWORD`
- `DASHBOARD_SESSION_SECRET`
- `KUBEBT_ENCRYPTION_KEY`
- OIDC Client Secret
- COS Secret
- SSH 私钥和密码

### HTTPS 与 Cookie

生产环境建议通过 Ingress、网关或负载均衡终止 TLS，并设置：

```text
DASHBOARD_COOKIE_SECURE=true
```

如果服务位于反向代理之后，请正确配置 `DASHBOARD_TRUSTED_PROXIES`，只信任真实的代理网段，避免客户端伪造 `X-Forwarded-For`。

### 多副本部署

多副本时必须固定：

- `DASHBOARD_SESSION_SECRET`
- `KUBEBT_ENCRYPTION_KEY`
- 统一的 MySQL / Redis / PVC 状态存储

后台任务只能由一个副本执行：

```text
KUBEBT_ENABLE_BACKGROUND_JOBS=true   # 仅一个 Pod
KUBEBT_ENABLE_BACKGROUND_JOBS=false  # 其他 Pod
```

否则可能重复执行宝塔同步、巡检、告警、审计裁剪和出站通知。

### Kubernetes 权限

默认 RBAC 覆盖较多资源，是为了支持控制台查看、YAML 编辑、Pod 终端、日志、应用部署和 Ingress 同步。生产环境可以按实际需求裁剪权限。

建议：

- 单独命名空间部署。
- 使用 NetworkPolicy 限制出站访问。
- 对管理入口加 IP 白名单、SSO 或网关认证。
- 对只读用户使用平台角色控制，避免共享管理员账号。

### 数据目录权限

Kubernetes 清单默认使用非 root 用户运行，并建议数据卷配合：

```yaml
securityContext:
  fsGroup: 65532
  runAsNonRoot: true
  runAsUser: 65532
  runAsGroup: 65532
```

SSH 凭据目录建议权限为 `0700`，并配合 `KUBEBT_ENCRYPTION_KEY` 加密保存。

### 文档公开页

文档中心支持公开分享页面和附件访问。请确认：

- 分享内容不包含内网拓扑、凭据、Token、私钥或敏感截图。
- COS / CDN 的公开访问策略符合组织要求。
- 公开页依赖的外部静态资源来源可信。

## 已知风险提示

- MySQL 表 `kubebt_platform_kv` 会保存动态配置和部分敏感配置，必须限制数据库访问权限并做好备份加密。
- 宝塔、vCenter、Harbor 等管理员凭据只应由可信管理员维护。
- Pod Exec、Web SSH、SFTP 具有较高运维权限，应开启审计并限制访问角色。
- 生产环境不建议长期暴露 `/setup` 给公网。
