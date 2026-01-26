const withNextIntl = require('next-intl/plugin')(
  // This is the default (also the `src` folder is supported out of the box)
  './i18n/index.ts'
)

module.exports = withNextIntl({
  images: {
    // 在 Netlify 上禁用图片优化以避免 _next/image 404 错误
    // Netlify 插件对图片优化的支持可能不稳定，禁用后直接使用原始图片
    unoptimized: true,
    // 允许所有域名（或者可以指定具体域名）
    remotePatterns: [],
  },
})
