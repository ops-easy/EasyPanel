# 全局 AI 对话助手

全局 AI 对话助手是平台右下角浮动入口中的运维问答面板。桌面端会在“使用文档”按钮上方展示“AI 对话”按钮；打开 AI 对话或使用文档 Sheet 后，浮动按钮会自动隐藏，避免遮挡当前页面。

## 配置来源

AI 对话复用“AI 巡检”里的 AI Provider 配置，不单独保存模型密钥或 Base URL。当前支持：

- `custom`：OpenAI compatible endpoint。
- `openclaw`：应用中心 OpenClaw 实例或手工兼容 endpoint。
- `hermes`：应用中心 Hermes gateway 实例或手工兼容 endpoint。

管理员在“AI 巡检配置”中启用并保存 Provider 后，所有已登录用户都可以使用右下角 AI 对话。普通用户只会看到是否可用和模型名称等脱敏状态；密钥、Base URL、应用中心实例 ID 不会返回到前端。

## API

前端只使用以下两个接口：

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/ops/ai-chat/status` | 获取 AI 对话是否可用、Provider 类型、来源、模型和脱敏提示 |
| `POST` | `/api/ops/ai-chat` | 发送多轮对话消息，返回完整 AI 回复 |

`POST /api/ops/ai-chat` 请求体字段：

- `messages`：最多 20 条，只允许 `user` / `assistant` 角色，最后一条必须是 `user`。
- `routePath`：当前页面路径。
- `routeDescription`：前端根据路由生成的页面说明。
- `pageTitle`：浏览器页面标题。

后端会限制单条和总内容长度，并在服务端拼接系统提示与轻量页面上下文。对话不写入 MySQL、Redis 或平台 KV。

## 前端行为

- 会话历史只保存在当前浏览器 `localStorage` 中。
- 清空按钮只清除本地历史。
- 第一版不使用流式输出，发送后等待完整回复。
- Markdown 回复复用 OpenClaw 对话 Markdown 渲染组件。
- 未配置或未启用 Provider 时，管理员会看到配置入口，普通用户会看到联系管理员提示。

## 安全边界

- 状态接口不返回 API Key、Base URL、应用中心实例 ID 或其他敏感连接信息。
- 发送接口只在服务端解析 Provider endpoint，并由服务端读取/解密必要凭据。
- AI 对话面向已登录用户开放；Provider 管理仍走原有管理员配置入口。
- 浏览器本地历史属于用户侧数据，不参与后端审计和持久化。
