# Netlify 404 问题修复指南

## 🐛 问题描述

构建成功但访问 https://annhub.netlify.app/ 显示 404。

## 🔍 原因分析

Next.js 13 使用 **App Router**，这是一个混合渲染模式（SSR + SSG），而不是纯静态站点。

从构建日志可以看到：
```
Route (app)                                Size     First Load JS
┌ ● /[locale]                              48.1 kB         132 kB
├   ├ /en
├   └ /zh-CN
ℇ  (Streaming)  server-side renders with streaming
```

- `●` 表示 SSG（静态生成）
- `ℇ` 表示 Streaming（服务端渲染）

标准的静态部署不支持这种混合模式，需要使用 Netlify 的 Next.js Plugin。

## ✅ 解决方案

### 方案 1: 使用 Netlify Essential Next.js Plugin（推荐）

这是官方推荐的方式，自动处理 Next.js 的 SSR、ISR、Middleware 等功能。

#### 步骤：

1. **更新 `netlify.toml`**（已完成）
   
   添加 plugin 配置：
   ```toml
   [[plugins]]
     package = "@netlify/plugin-nextjs"
   ```

2. **重新部署**
   ```bash
   git add netlify.toml
   git commit -m "fix: add Netlify Next.js plugin for proper deployment"
   git push
   ```

3. **等待 Netlify 自动部署**
   
   Netlify 会：
   - 自动安装 `@netlify/plugin-nextjs`
   - 处理 Next.js 的混合渲染
   - 自动配置重定向和函数

#### 优势：
- ✅ 支持 SSR、ISR、Middleware
- ✅ 自动优化性能
- ✅ 零配置，开箱即用
- ✅ 官方支持和维护

---

### 方案 2: 配置为纯静态导出（备选）

如果不需要 SSR 功能，可以将 Next.js 配置为纯静态导出。

#### 步骤：

1. **更新 `website/next.config.js`**
   
   ```javascript
   const withNextIntl = require('next-intl/plugin')(
     './i18n/index.ts'
   )
   
   module.exports = withNextIntl({
     // 启用静态导出
     output: 'export',
     
     // 禁用图片优化（静态导出不支持）
     images: {
       unoptimized: true,
     },
     
     // 其他配置...
   })
   ```

2. **更新 `netlify.toml`**
   
   ```toml
   [build]
     command = "cd website && npm install && npm run build"
     publish = "website/out"  # 静态导出目录是 out 而不是 .next
   ```

3. **注意事项**
   - ⚠️ 不支持 SSR、ISR
   - ⚠️ 不支持 API Routes
   - ⚠️ 不支持 Middleware
   - ⚠️ 图片优化需要禁用

#### 何时使用：
- 网站完全是静态内容
- 不需要服务端渲染
- 不使用 API Routes

---

## 🚀 推荐：使用方案 1

基于你的项目使用了：
- ✅ App Router (`/[locale]`)
- ✅ Middleware (`middleware.ts`)
- ✅ API Route (`/api/chat`)
- ✅ 国际化 (next-intl)

**强烈建议使用方案 1（Netlify Plugin）**，这样可以保留所有功能。

## 📝 方案 1 的详细工作流程

### Netlify Plugin 做了什么：

1. **在构建时**：
   - 分析 Next.js 路由
   - 区分静态页面和动态页面
   - 生成 Netlify Functions 用于 SSR

2. **在运行时**：
   - 静态页面直接从 CDN 提供
   - 动态页面通过 Netlify Functions 渲染
   - Middleware 在边缘函数中运行

3. **自动优化**：
   - 智能缓存策略
   - 边缘函数优化
   - 图片优化支持

### 构建日志示例（使用 Plugin 后）：

```
6:48:10 PM: Installing plugins
6:48:11 PM:  - @netlify/plugin-nextjs@5.0.0
6:48:13 PM: Next.js Plugin configured successfully
6:48:23 PM: - info Compiled successfully
6:48:42 PM: Next.js cache saved
6:48:43 PM: Netlify Functions generated for SSR routes
6:48:44 PM: Site is live ✨
```

## 🔍 验证部署

部署成功后，可以访问：

- 主页: https://annhub.netlify.app/
- 英文版: https://annhub.netlify.app/en
- 中文版: https://annhub.netlify.app/zh-CN
- Showcase: https://annhub.netlify.app/en/showcase

## 📊 性能对比

| 方案 | 首次加载 | 后续导航 | 动态内容 | SEO |
|------|---------|---------|---------|-----|
| **Plugin** | 快（CDN + Edge） | 极快（预取） | ✅ 支持 | ✅ 优秀 |
| **静态导出** | 快（纯 CDN） | 快（客户端） | ❌ 不支持 | ✅ 优秀 |

## 💡 额外优化建议

使用 Netlify Plugin 后，还可以：

1. **启用缓存**
   ```toml
   [[plugins]]
     package = "@netlify/plugin-nextjs"
   [plugins.inputs]
     # 启用持久化缓存
     buildCache = true
   ```

2. **配置 ISR**
   ```javascript
   // 在页面中配置重新验证时间
   export const revalidate = 60 // 60秒后重新生成
   ```

3. **优化图片**
   ```javascript
   // Next.js Image 组件会自动使用 Netlify 的图片优化
   import Image from 'next/image'
   ```

## 🎯 总结

**当前问题**：404 是因为 Next.js App Router 需要特殊处理

**解决方法**：添加 `@netlify/plugin-nextjs` 到 `netlify.toml`

**操作步骤**：
```bash
git add netlify.toml
git commit -m "fix: add Netlify Next.js plugin for proper deployment"
git push
```

**预期结果**：网站正常访问，支持所有 Next.js 功能
