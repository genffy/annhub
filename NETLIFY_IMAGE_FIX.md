# Netlify 图片 404 问题修复

## 问题
部署后图片路径显示 404：
```
/_next/image?url=%2Fpreview%2Fhighlight.png&w=3840&q=75
```

## 原因
这是 Next.js Image 组件的优化 API。Netlify 需要正确配置才能支持 Next.js 的图片优化功能。

## 解决方案

### 1. 启用 Netlify Image CDN（推荐）

已在 `netlify.toml` 中配置：
```toml
[[plugins]]
  package = "@netlify/plugin-nextjs"
  
  [plugins.inputs]
    imageOptimization = true
```

这会启用 Netlify 的图片优化 CDN，自动处理所有 Next.js Image 组件的请求。

### 2. 验证图片文件

确认图片文件在正确位置：
```
website/public/preview/highlight.png ✓
```

### 3. 检查 Next.js 配置

如果图片优化仍有问题，可以在 `website/next.config.js` 中添加：

```javascript
const withNextIntl = require('next-intl/plugin')(
  './i18n/index.ts'
)

module.exports = withNextIntl({
  images: {
    // Netlify 支持的图片格式
    formats: ['image/avif', 'image/webp'],
    
    // 允许的图片域名（如果使用外部图片）
    domains: [],
    
    // 图片尺寸配置
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
})
```

## 部署后验证

推送更新后，Netlify 会：
1. 安装 `@netlify/plugin-nextjs`
2. 启用图片优化 CDN
3. 自动处理 `/_next/image` 请求

图片应该可以正常加载了。

## 备用方案：禁用图片优化（不推荐）

如果急需上线，可以临时禁用图片优化：

```javascript
// website/next.config.js
module.exports = withNextIntl({
  images: {
    unoptimized: true,  // 禁用图片优化
  },
})
```

但这会失去：
- ❌ 自动 WebP/AVIF 转换
- ❌ 响应式图片
- ❌ 延迟加载优化

**不建议在生产环境使用此方案**。

## 相关资源

- [Netlify Next.js Plugin Docs](https://docs.netlify.com/integrations/frameworks/next-js/overview/)
- [Next.js Image Optimization](https://nextjs.org/docs/pages/building-your-application/optimizing/images)
