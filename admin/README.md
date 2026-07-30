# Throne Blog Admin

用于 Hexo + GitHub Pages 博客的在线 Markdown 写作控制台。

## 功能

- CodeMirror 6 Markdown 编辑器、实时预览、KaTeX 和代码高亮
- 本地草稿、撤销/重做、图片上传和编辑/预览同步滚动
- AI 润色、格式整理、问题检查、摘要/标签/分类生成
- AI 完整差异审阅，确认后再应用修改
- 提交到 GitHub，并跟踪 Hexo 与 GitHub Pages 部署状态
- 浅色/深色主题、响应式布局和安全响应头

## 环境要求

- Node.js 20 或更高版本
- 一个 GitHub Personal Access Token，可读写目标博客仓库
- 可选的 OpenAI 兼容接口

## 本地运行

1. 在 `admin` 目录安装依赖：

   ```bash
   npm ci
   ```

2. 参考 `.env.example` 配置环境变量。项目本身不会自动读取 `.env`，本地运行时需要由 shell 或进程管理器注入。

3. 启动服务：

   ```bash
   npm start
   ```

默认地址为 `http://localhost:8787`。

## 必需环境变量

| 变量 | 用途 |
| --- | --- |
| `ADMIN_TOKEN` | 登录管理端的口令 |
| `GITHUB_OWNER` | GitHub 用户名或组织名 |
| `GITHUB_REPO` | Hexo 博客仓库名 |
| `GITHUB_BRANCH` | 保存 Markdown 源文件的分支 |
| `GITHUB_TOKEN` | 读写仓库和查询 Actions 的令牌 |

AI 可通过服务端的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL` 和 `OPENAI_API_STYLE` 配置，也可以在管理端当前标签页中临时填写兼容接口信息。

## Render 部署

仓库根目录的 `render.yaml` 已包含 Blueprint。部署完整仓库时，Render 会使用 `admin` 作为服务根目录，执行：

```text
npm ci && npm test
npm start
```

在 Render 后台填写标记为 `sync: false` 的敏感环境变量。不要把真实 Token 或 API Key 提交到 Git。

## 验证

```bash
npm test
```

测试命令会先构建浏览器端 CodeMirror 包，再运行 Node.js 测试。
