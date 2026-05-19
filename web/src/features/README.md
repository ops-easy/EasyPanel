# 前端 Feature 目录约定

前端按业务功能归属组织代码，新增业务页面优先放入 `src/features/<domain>`。

- `pages/`：路由页面组件。
- `components/`：本业务私有组件。
- `hooks/`：本业务私有 hooks。
- `api.ts`：本业务后端接口函数。
- `types.ts`：本业务 DTO 与视图模型。
- `queryKeys.ts`：复杂业务的 TanStack Query key。
- `index.ts`：稳定对外入口，避免暴露内部文件层级。

公共基础设施放在 `src/shared`：

- `shared/ui`：无业务语义的基础 UI、编辑器、展示组件。
- `shared/api`：通用 HTTP client、WebSocket URL helper、API 错误类型。
- `shared/layout`：全局布局、顶部栏、侧边栏和全局横幅。

应用启动、Provider、路由组合、认证守卫和全局 fallback 放在 `src/app`。

`src/pages` 只保留跨业务顶层入口，例如 `HomeHub`、`Login`、`Setup`、`NotFound`。不要把新的业务页面放回 `src/pages` 根目录。
