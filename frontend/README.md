# 前端开发说明

## 当前源码分层

- `src/app`：应用启动、Provider、路由组合、认证守卫、全局 fallback。
- `src/shared`：跨业务共享的 UI、布局和工具组件。
- `src/features`：按业务归属的页面、组件、接口、类型和 hooks。
- `src/pages`：只保留 `HomeHub`、`Login`、`Setup`、`NotFound` 等顶层入口。
- `src/md-editor`：文档中心编辑器，后续按独立功能包继续演进。
- `deploy`：前端镜像相关部署配置，例如 Nginx 配置。
- `src/generated`：构建工具生成的类型声明，不手工维护。

新增业务页面时，优先放入 `src/features/<domain>/pages`；不要继续堆到 `src/pages` 根目录。

`frontend/` 是 EasyPanel 的前端控制台，基于 React、TypeScript、Vite、Tailwind CSS、Radix UI、TanStack Query 和 React Router。

## 主要能力

- 工作台与模块导航。
- Kubernetes 资源列表、详情、日志、终端、YAML 编辑和图形化编辑。
- 宝塔 Ingress 同步、证书和运行时设置页面。
- Redis、Kafka、OpenSearch、Cloud VM、OpenClaw、DNS 等应用中心页面。
- vCenter、堡垒机、云主机、爱快路由和性能监控页面。
- 观测与巡检总览、监控看板、告警通知、日志检索、日志接入和巡检报告页面。
- 文档中心、Markdown 编辑器、附件、公开分享和 Excalidraw。
- 账号、权限、审计、站点统计和平台外观设置。

## 常用命令

```bash
cd frontend
npm ci
npm run dev
npm run test
npm run check:api
npm run check
npm run build
npm run lint
npm run preview
```

开发服务默认由 Vite 启动。后端 API 以 `/api/` 为前缀，生产镜像中由 Nginx 代理到后端 Service。

## 目录结构

```text
frontend/
├── src/App.tsx                 # 路由入口
├── src/main.tsx                # 应用入口
├── src/pages/                  # 页面
├── src/components/             # 复用组件
├── src/lib/                    # API、工具函数、格式化和共享逻辑
├── src/hooks/                  # React Hooks
├── src/auth/                   # 登录态与认证上下文
├── src/md-editor/              # 文档中心编辑器
├── public/                     # 静态资源
├── deploy/                     # 前端镜像 Nginx 等部署配置
└── Dockerfile                  # 前端镜像构建
```

## 构建产物

`npm run build` 会生成 `frontend/dist/`。该目录已被 `.gitignore` 忽略，不应提交到仓库。前端镜像构建时会把构建产物复制到 Nginx 镜像中。

## 开发约定

- 页面文案以中文为主。
- 保持当前控制台式布局，不新增营销落地页。
- 优先使用已有 UI 组件、API 封装和工具函数。
- 新增接口调用统一走 `@/lib/api`；新增 DTO 优先放在所属 feature 内，只有跨 feature 复用的类型才上移到 `src/lib/api.ts`。
- 新增或修改 `/api/`、`/r/`、`/d/` 路径后运行 `npm run check:api`，并随代码提交更新 `docs/api-contract/*.json`。
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
