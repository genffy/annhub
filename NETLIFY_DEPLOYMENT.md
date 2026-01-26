# Netlify 部署指南

本项目使用 Netlify 部署文档网站（website），配置已通过 `netlify.toml` 文件完成。

## 🚀 快速部署

### 首次部署

1. **连接 GitHub 仓库**
   - 登录 [Netlify](https://netlify.com)
   - 点击 "Add new site" → "Import an existing project"
   - 选择 GitHub 并授权
   - 选择 `annhub` 仓库

2. **构建设置（自动读取）**
   
   Netlify 会自动读取 `netlify.toml` 配置，你应该看到：
   
   - **Base directory**: `/` (根目录)
   - **Build command**: `cd website && npm install && npm run build`
   - **Publish directory**: `website/.next`
   - **Node version**: 24 (从 `.node-version` 读取)

3. **点击 "Deploy site"**

### 如果自动配置未生效

如需手动配置，在 Netlify 的 "Site settings" → "Build & deploy" → "Build settings" 中设置：

| 设置项 | 值 |
|--------|-----|
| **Base directory** | `/` (留空) |
| **Build command** | `cd website && npm install && npm run build` |
| **Publish directory** | `website/.next` |
| **Functions directory** | (留空) |

在 "Environment variables" 中添加：
- `NODE_VERSION` = `24`

## 📋 配置说明

### netlify.toml 核心配置

```toml
[build]
  base = "/"                                          # 根目录，可读取 .node-version
  command = "cd website && npm install && npm run build"  # 自动安装依赖并构建
  publish = "website/.next"                          # Next.js 输出目录
  
[build.environment]
  NODE_VERSION = "24"                                # Node.js 版本（备用）
```

### 为什么这样配置？

**Base directory 选择根目录 `/` 的原因：**

1. ✅ **自动识别 Node 版本**: Netlify 可以读取根目录的 `.node-version` 文件
2. ✅ **配置版本化**: `netlify.toml` 在代码仓库中，团队共享配置
3. ✅ **灵活性**: 后续可以轻松添加其他部署目标（如 Chrome Extension）

**构建命令包含 `npm install` 的原因：**

- Website 目录有独立的 `package.json`
- Netlify 默认只在 base directory 安装依赖
- 需要显式进入 website 目录安装其依赖

## 🔄 构建流程

实际构建流程如下：

```bash
# 1. Netlify 在根目录检测到 .node-version，使用 Node 24
# 2. Netlify 在根目录运行 npm install（安装扩展依赖，可选）
# 3. 执行构建命令：
cd website              # 进入 website 目录
npm install             # 安装 website 依赖
npm run build           # 构建 Next.js 应用
# 4. 发布 website/.next 目录内容
```

## 🎯 部署分支策略

通过 `netlify.toml` 配置了不同环境：

- **Production** (main 分支)
  ```toml
  [context.production]
  command = "cd website && npm install && npm run build"
  ```

- **Deploy Previews** (Pull Requests)
  ```toml
  [context.deploy-preview]
  command = "cd website && npm install && npm run build"
  ```

- **Branch Deploys** (其他分支)
  ```toml
  [context.branch-deploy]
  command = "cd website && npm install && npm run build"
  ```

## ⚡ 性能优化

### 缓存配置

已配置静态资源缓存：

```toml
[[headers]]
  for = "/_next/static/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### 构建优化建议

1. **启用依赖缓存**
   - Netlify 默认缓存 `node_modules`
   - 重复构建会更快

2. **使用 Netlify Build Plugins**（可选）
   ```toml
   [[plugins]]
     package = "@netlify/plugin-nextjs"
   ```

## 🐛 故障排查

### 问题 1: Node 版本不正确

**症状**: 构建日志显示 Node 版本不是 24

**解决方案**:
1. 检查 `.node-version` 文件是否在根目录
2. 在 Netlify 环境变量中显式设置 `NODE_VERSION=24`

### 问题 2: Website 依赖未安装

**症状**: 构建失败，提示找不到某些模块

**解决方案**:
1. 确认构建命令包含 `cd website && npm install`
2. 检查 `website/package.json` 是否存在

### 问题 3: 发布目录错误

**症状**: 部署成功但网站显示 404

**解决方案**:
1. 确认 Publish directory 设置为 `website/.next`
2. 检查 Next.js 构建是否成功

### 问题 4: 环境变量

**症状**: 构建失败或运行时错误

**解决方案**:
在 Netlify UI 的 "Site settings" → "Environment variables" 中添加：
- Next.js 所需的环境变量（如 API keys）
- 确保变量名与 `.env.example` 一致

## 📊 构建日志示例

成功的构建日志应该类似：

```
3:26:05 PM: Build ready to start
3:26:06 PM: Detected Node.js version: v24.13.0
3:26:07 PM: Started restoring cached node modules
3:26:10 PM: Finished restoring cached node modules
3:26:11 PM: Installing dependencies
3:26:15 PM: Dependencies installed
3:26:15 PM: Started running build command
3:26:16 PM: $ cd website && npm install && npm run build
3:26:20 PM: added 438 packages
3:26:21 PM: Creating an optimized production build...
3:26:45 PM: Compiled successfully
3:26:45 PM: Build completed successfully
3:26:46 PM: Finished processing build request in 40s
```

## 🔗 相关链接

- [Netlify Documentation](https://docs.netlify.com/)
- [netlify.toml Reference](https://docs.netlify.com/configure-builds/file-based-configuration/)
- [Next.js on Netlify](https://docs.netlify.com/integrations/frameworks/next-js/)
- [Node.js Version Management](https://docs.netlify.com/configure-builds/manage-dependencies/#node-js-and-javascript)

## 💡 提示

- 每次推送到 GitHub，Netlify 会自动触发构建
- Pull Request 会创建预览部署
- 可以在 Netlify UI 中查看构建日志和部署历史
- 建议设置 Slack/Email 通知以接收部署状态
