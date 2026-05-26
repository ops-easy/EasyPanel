# 贡献指南

## 前端目录约定

前端新增业务页面、业务组件、接口封装和类型定义时，优先放入 `frontend/src/features/<domain>`。

- 跨业务基础 UI 放在 `frontend/src/shared/ui`。
- 通用 HTTP/WebSocket client 放在 `frontend/src/shared/api`。
- 全局布局放在 `frontend/src/shared/layout`。
- 应用启动、Provider、路由组合和守卫放在 `frontend/src/app`。
- `frontend/src/pages` 只保留 `HomeHub`、`Login`、`Setup`、`NotFound` 等顶层入口。

感谢你对 EasyPanel 的关注。这个项目覆盖 Kubernetes、宝塔面板、vCenter、监控日志、应用中心和文档中心等多个运维场景，欢迎通过 Issue、Pull Request 或文档改进参与。

## 提交 Issue

提交问题前请先搜索已有 Issue，避免重复。

一个高质量的问题报告通常包含：

- 发生问题的版本或提交号
- 部署方式：本地运行、Kustomize、Helm、容器镜像或其他方式
- 相关配置：请隐藏密码、Token、私钥、Cookie 等敏感信息
- 复现步骤
- 实际结果与期望结果
- 后端日志、浏览器控制台日志或 Kubernetes 事件

安全漏洞不要通过公开 Issue 报告，请参考 [SECURITY.md](./SECURITY.md)。

## 提交 Pull Request

建议流程：

1. Fork 仓库并创建功能分支。
2. 保持改动范围清晰，避免把无关格式化、依赖升级和功能改动混在一起。
3. Go 代码使用 `gofmt`。
4. 前端代码遵循当前 React、TypeScript、Tailwind CSS 和 Radix UI 的写法。
5. 涉及行为变化时补充测试或说明验证方式。
6. 文档必须使用 UTF-8，并保持中文可读。

常用检查命令：

```bash
cd backend && go test ./...
cd frontend && npm run build
cd frontend && npm run lint
```

如果某个检查因为环境依赖不可用而无法运行，请在 PR 描述中说明原因。

## 本地开发

```bash
git clone https://github.com/ops-easy/EasyPanel.git
cd EasyPanel

make start-backend
make start-frontend
```

前端独立开发：

```bash
cd frontend
npm ci
npm run dev
```

后端独立开发：

```bash
cd backend
go run .
```

## 项目结构

```text
backend/                     Go 后端
frontend/                    React + Vite 前端
k8s/backend/                 后端 Kubernetes 清单
k8s/frontend/                前端 Kubernetes 清单
k8s/charts/easypanel/          Helm Chart
docs/                        运维和部署文档
.github/workflows/           GitHub Actions
```

## 文档规范

- 所有项目文档使用中文。
- 文件编码统一为 UTF-8。
- 命令示例尽量可复制运行。
- 涉及生产环境的说明必须包含安全提醒。
- 不要提交乱码、机翻残留或与当前代码不一致的路径。

## 提交信息

提交信息可以使用中文或英文，重点是清楚说明改动内容，例如：

```text
docs: 更新中文部署文档
fix: 修复 Ingress 同步配置校验
feat: 增加 Kafka 实例限速面板
```

## 许可证

提交贡献即表示你同意相关内容以 [MIT License](./LICENSE) 发布。
