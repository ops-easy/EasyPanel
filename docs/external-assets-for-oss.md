# 文档公开页静态资源 CDN 配置

EasyPanel 的文档中心支持公开分享 Markdown 页面。公开页会用到 Markdown 样式、代码高亮、KaTeX、Excalidraw 等静态资源。默认情况下可以使用内置公网地址；如果你的环境无法访问公网，或希望走企业 OSS/CDN，可以配置自定义静态资源根地址。

## 配置方式

在平台后台的“账号与平台 / 外观与名称”中填写：

```text
assetsCdnBaseUrl=https://cdn.example.com/cmdb
```

也可以通过环境变量设置：

```text
EASYPANEL_ASSETS_CDN_BASE=https://cdn.example.com/cmdb
```

如果运行时配置和环境变量同时存在，以运行时配置为准。

要求：

- 不要以 `/` 结尾。
- CDN 路径前缀要与上传目录保持一致。
- `.mjs`、`.css`、`.js`、`.woff2` 等文件返回正确的 `Content-Type`。
- 公开页跨域访问时需要允许 CORS。

## 推荐目录结构

上传到 OSS/CDN 后建议保持如下结构：

```text
cmdb/
└── doc-public/
    ├── excalidraw/excalidraw-0.18.0-prod/
    ├── esm/
    │   ├── react-18.2.0.mjs
    │   ├── react-dom-client-18.2.0.mjs
    │   └── excalidraw-0.18.0.mjs
    ├── github-markdown-css/5.9.0/github-markdown-light.min.css
    ├── highlightjs/11.11.1/styles/xcode.min.css
    ├── highlightjs/11.11.1/highlight.min.js
    └── katex/0.16.11/
        ├── katex.min.css
        └── fonts/*.woff2
```

上传示例：

```bash
tar -czvf cmdb.tar.gz cmdb
```

## 影响范围

自定义 CDN 只影响文档公开页，例如 `/r/*.html`。

不影响：

- 主控制台 `frontend/dist` 的资源。
- 前端镜像中的 `/assets`。
- 后端 API。
- 文档附件本身的存储位置。

## ESM 文件

`doc-public/esm/*.mjs` 可以从可信构建源或私有镜像中准备。浏览器加载这些模块时通常需要：

- `Content-Type: text/javascript` 或兼容类型。
- 允许公开页所在域名跨域读取。
- CDN 不篡改模块内容。

如果 ESM 加载失败，可暂时清空 `assetsCdnBaseUrl`，回退到默认资源地址进行排查。

## KaTeX 字体

如果公式显示缺字或字体加载失败，请确认 `katex.min.css` 中引用的字体文件已同步到：

```text
cmdb/doc-public/katex/0.16.11/fonts/
```

字体路径必须与 CSS 中的相对路径匹配。

## 安全提醒

- 公共 CDN 上的脚本会被用户浏览器直接执行，务必保证来源可信。
- 不要把内部文档、凭据、配置文件或私有附件误上传到公共桶。
- 如果公开页面向公网，建议配合对象存储防盗链、访问日志和缓存刷新策略。
