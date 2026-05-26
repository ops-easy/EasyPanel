# EasyPanel 演示数据与截图

本目录保存 README 使用的演示数据和前端截图。截图不是手绘图，也不是静态 HTML 预览，而是由 `scripts/generate-demo-assets.mjs` 启动真实 Vite 前端，在浏览器测试上下文中 mock `/api/*` 响应后截取现有页面得到。

- 数据源：`demo-data.json`
- 截图目录：`assets/`
- 重新生成：`node scripts/generate-demo-assets.mjs`

脚本会打开这些现有前端路径：

- `/`
- `/cluster/ns/easy/pods`
- `/cluster/apps/dashboard`
- `/cluster/baota/ingress`
