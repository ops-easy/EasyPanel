# 前端开发说明

`web/` 是 Kube-BT-Sync 的前端控制台，基于 React、TypeScript、Vite、Tailwind CSS、Radix UI、TanStack Query 和 React Router。

## 主要能力

- 工作台与模块导航。
- Kubernetes 资源列表、详情、日志、终端、YAML 编辑和图形化编辑。
- 宝塔 Ingress 同步、证书和运行时设置页面。
- Redis、Kafka、OpenSearch、Cloud VM、OpenClaw、DNS 等应用中心页面。
- vCenter、堡垒机、云主机、爱快路由和性能监控页面。
- AI 巡检、监控、告警、日志查询和日志采集页面。
- 文档中心、Markdown 编辑器、附件、公开分享和 Excalidraw。
- 账号、权限、审计、站点统计和平台外观设置。

## 常用命令

```bash
cd web
npm ci
npm run dev
npm run build
npm run lint
npm run preview
```

开发服务默认由 Vite 启动。后端 API 以 `/api/` 为前缀，生产镜像中由 Nginx 代理到后端 Service。

## 目录结构

```text
web/
├── src/App.tsx                 # 路由入口
├── src/main.tsx                # 应用入口
├── src/pages/                  # 页面
├── src/components/             # 复用组件
├── src/lib/                    # API、工具函数、格式化和共享逻辑
├── src/hooks/                  # React Hooks
├── src/auth/                   # 登录态与认证上下文
├── src/md-editor/              # 文档中心编辑器
├── public/                     # 静态资源
├── scripts/                    # 构建辅助脚本
├── nginx.conf                  # 前端镜像 Nginx 配置
└── Dockerfile                  # 前端镜像构建
```

## 构建产物

`npm run build` 会生成 `web/dist/`。该目录已被 `.gitignore` 忽略，不应提交到仓库。前端镜像构建时会把构建产物复制到 Nginx 镜像中。

## 开发约定

- 页面文案以中文为主。
- 保持当前控制台式布局，不新增营销落地页。
- 优先使用已有 UI 组件、API 封装和工具函数。
- 对高风险操作使用确认弹窗或清晰的状态反馈。
- 涉及终端、凭据、YAML 下发、删除资源等功能时，注意权限与审计提示。
- 新增路由时同步关注 `src/App.tsx`、导航菜单和权限控制。

## 与后端联调

本地联调时通常开两个终端：

```bash
# 终端 1
make start-backend

# 终端 2
make start-frontend
```

如果需要代理到不同后端地址，请按当前 Vite 配置和后端监听地址调整环境变量或本地代理配置。
