const withNextIntl = require('next-intl/plugin')(
  // This is the default (also the `src` folder is supported out of the box)
  './i18n/index.ts'
)

module.exports = withNextIntl({
  images: {
    // 在 Netlify 上启用图片优化
    unoptimized: false,
    // 允许所有域名（或者可以指定具体域名）
    remotePatterns: [],
  },
})
