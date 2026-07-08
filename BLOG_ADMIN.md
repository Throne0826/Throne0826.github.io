# Blog Admin Setup

这个项目现在包含一个独立的在线写作后台，目录是 `admin/`。它用于编辑 Hexo 文章、调用 AI 润色 Markdown，并把文章提交到 GitHub。提交后，GitHub Actions 会自动构建 Hexo，并把生成结果发布到 `lifexoryoung.cn`。

## 1. 推荐仓库结构

你的 GitHub Pages 仓库是：

```text
Throne0826/Throne0826.github.io
```

建议使用同一个仓库的两个分支：

```text
source  Hexo 源码分支，保存当前 D:\myblog\blog 里的内容
main    GitHub Pages 分支，只保存 hexo generate 之后的 public 产物
```

这样后台只改 `source/_posts/*.md`，不会直接碰线上静态页面。

## 2. 把本地源码推到 source 分支

当前 `D:\myblog\blog` 不是 Git 工作区。首次使用时可以在这个目录运行：

```powershell
git init
git branch -M source
git add .
git commit -m "Add Hexo source and blog admin"
git remote add origin https://github.com/Throne0826/Throne0826.github.io.git
git push -u origin source
```

`.gitignore` 已经排除了 `node_modules/`、`public/`、`.deploy*/`、`.env`，这些不要提交。

## 3. 自动发布

`.github/workflows/deploy-hexo.yml` 会在 `source` 分支更新后运行：

```text
npm ci
npm run build
```

然后把 `public/` 发布到同一个仓库的 `main` 分支，并保留自定义域名：

```text
lifexoryoung.cn
```

正常情况下不需要额外配置 `PAGES_REPO_TOKEN`，workflow 使用 GitHub 自动提供的 `GITHUB_TOKEN` 写入同仓库 `main` 分支。

## 4. 配置后台服务

进入后台目录：

```powershell
cd admin
copy .env.example .env
```

然后设置这些环境变量：

```text
ADMIN_TOKEN=一个很长的后台访问密码
GITHUB_OWNER=Throne0826
GITHUB_REPO=Throne0826.github.io
GITHUB_BRANCH=source
GITHUB_TOKEN=一个能读写该仓库 source 分支的 GitHub token
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4.1-mini
```

本地运行：

```powershell
npm run admin
```

打开：

```text
http://localhost:8787
```

## 5. 部署后台

后台是一个纯 Node 20 服务，可以部署到 Render、Railway、Fly.io、VPS、宝塔面板 Node 项目等平台。

推荐绑定子域名：

```text
admin.lifexoryoung.cn
```

后台服务必须配置第 4 步里的环境变量。不要把 `.env` 提交到 GitHub。

## 6. 使用流程

1. 打开后台页面。
2. 输入 `ADMIN_TOKEN`。
3. 点击刷新文章。
4. 新建或打开 Markdown。
5. 点击 AI 处理。
6. 检查内容。
7. 点击保存并发布。
8. 等待 GitHub Actions 构建完成，`lifexoryoung.cn` 会更新。
